import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  limit,
  deleteDoc,
  updateDoc,
  increment,
} from 'firebase/firestore'
import { getFirebaseDb } from '../config/firebase'
import { findBestMatch } from '../utils/registryMatcher'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue, IssueResolutionMethod } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { AuditLog } from '../models/auditLog'
import type { ShareLink } from '../models/shareLink'
import type { PaginationParams, PaginatedResult } from '../providers/DataProvider'

function toTimestamp(d: Date): Timestamp {
  return Timestamp.fromDate(d)
}

function fromTimestamp(t: Timestamp): Date {
  return t.toDate()
}

type BatchLite = {
  id: string
  institutionId?: string
  uploadedAt: Date
  isActive?: boolean
  fileName?: string
  importSummary?: { institutionName?: string }
}

function normalizeScope(v?: string): string {
  return (v ?? '').trim().toLowerCase()
}

function batchScopeKey(batch: BatchLite): string {
  const inst = normalizeScope(batch.institutionId)
  const branch = normalizeScope(batch.importSummary?.institutionName)
  const file = normalizeScope(batch.fileName)
  return `${inst}::${branch || file}`
}

async function reconcileLegacyActiveBatches(): Promise<void> {
  const db = getFirebaseDb()
  const snap = await getDocs(query(collection(db, 'importBatches'), orderBy('uploadedAt', 'desc')))
  if (snap.empty) return

  const byInstitution = new Map<string, BatchLite[]>()
  snap.docs.forEach((d) => {
    const data = d.data()
    if (!data.institutionId) return
    const arr = byInstitution.get(data.institutionId) ?? []
    arr.push({
      id: d.id,
      institutionId: data.institutionId,
      uploadedAt: fromTimestamp(data.uploadedAt),
      isActive: data.isActive,
      fileName: data.fileName,
      importSummary: data.importSummary,
    })
    byInstitution.set(data.institutionId, arr)
  })

  const wb = writeBatch(db)
  let changes = 0

  byInstitution.forEach((batches) => {
    const byScope = new Map<string, BatchLite[]>()
    batches.forEach((b) => {
      const k = batchScopeKey(b)
      const arr = byScope.get(k) ?? []
      arr.push(b)
      byScope.set(k, arr)
    })

    byScope.forEach((scopeBatches) => {
      const sorted = [...scopeBatches].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      const currentlyActive = sorted.filter((b) => b.isActive === true)
      const winner = currentlyActive[0] ?? sorted[0]
      sorted.forEach((b) => {
        const shouldBeActive = b.id === winner.id
        if (b.isActive !== shouldBeActive) {
          wb.update(doc(db, 'importBatches', b.id), { isActive: shouldBeActive })
          changes += 1
        }
      })
    })
  })

  if (changes > 0) await wb.commit()
}

// ─── Institutions ───────────────────────────────────────────────
export async function upsertInstitution(inst: Institution): Promise<string> {
  const db = getFirebaseDb()
  const q = query(collection(db, 'institutions'), where('oib', '==', inst.oib))
  const snap = await getDocs(q)

  const withRegistry = { ...inst }
  if (!snap.empty) {
    const existing = snap.docs[0].data() as Partial<Institution>
    // Keep existing registryIndex; don't overwrite with undefined from import
    if (withRegistry.registryIndex === undefined && existing.registryIndex !== undefined) {
      withRegistry.registryIndex = existing.registryIndex
    }
    const id = snap.docs[0].id
    await setDoc(doc(db, 'institutions', id), {
      ...withRegistry,
      createdAt: toTimestamp(inst.createdAt),
      updatedAt: toTimestamp(new Date()),
    })
    return id
  }

  // New institution: try auto-matching to registry if not explicitly set
  if (withRegistry.registryIndex === undefined || withRegistry.registryIndex === null) {
    const match = findBestMatch(inst.name)
    if (match) withRegistry.registryIndex = match.index
  }

  const ref = await addDoc(collection(db, 'institutions'), {
    ...withRegistry,
    createdAt: toTimestamp(inst.createdAt),
    updatedAt: toTimestamp(new Date()),
  })
  return ref.id
}

export async function updateInstitutionRegistryIndex(
  institutionId: string,
  registryIndex: number | null,
): Promise<void> {
  const db = getFirebaseDb()
  await updateDoc(doc(db, 'institutions', institutionId), { registryIndex })
}

export async function patchInstitution(
  institutionId: string,
  fields: Partial<import('../models/institution').Institution>,
): Promise<void> {
  const db = getFirebaseDb()
  await updateDoc(doc(db, 'institutions', institutionId), { ...fields, updatedAt: toTimestamp(new Date()) })
}

export async function bulkAutoMatchRegistryIndex(): Promise<{
  matched: number
  skipped: number
  alreadyLinked: number
}> {
  // Uparivanje je sada OIB-based i implicitno — ne treba pisati u Firestore.
  // Ova funkcija ostaje u interfejsu radi kompatibilnosti; vraća samo statistiku.
  const { getRegistry } = await import('../utils/registryLoader')
  const registry = await getRegistry()
  const institutions = await getInstitutions()
  let matched = 0, skipped = 0
  for (const inst of institutions) {
    if (registry.byOib.has(inst.oib)) matched++
    else skipped++
  }
  return { matched, skipped, alreadyLinked: 0 }
}

export async function getInstitutions(): Promise<Institution[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(query(collection(db, 'institutions'), orderBy('name')))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      ...data,
      id: d.id,
      createdAt: fromTimestamp(data.createdAt),
      updatedAt: fromTimestamp(data.updatedAt),
    } as Institution
  })
}

export async function getInstitutionById(id: string): Promise<Institution | null> {
  const db = getFirebaseDb()
  const snap = await getDoc(doc(db, 'institutions', id))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    ...data,
    id: snap.id,
    createdAt: fromTimestamp(data.createdAt),
    updatedAt: fromTimestamp(data.updatedAt),
  } as Institution
}

// ─── Import Batches ──────────────────────────────────────────────
export async function createBatch(batch: ImportBatch): Promise<string> {
  const db = getFirebaseDb()
  const ref = await addDoc(collection(db, 'importBatches'), {
    ...batch,
    uploadedAt: toTimestamp(batch.uploadedAt),
  })
  return ref.id
}

export async function updateBatch(id: string, data: Partial<ImportBatch>): Promise<void> {
  const db = getFirebaseDb()
  await setDoc(doc(db, 'importBatches', id), data, { merge: true })
}

export async function getBatches(): Promise<ImportBatch[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'importBatches'), orderBy('uploadedAt', 'desc'))
  )
  return snap.docs
    .map((d) => {
      const data = d.data()
      return { ...data, id: d.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
    })
    .filter((b) => b.isDeleted !== true)
}

export async function getBatch(id: string): Promise<ImportBatch | null> {
  const db = getFirebaseDb()
  const snap = await getDoc(doc(db, 'importBatches', id))
  if (!snap.exists()) return null
  const data = snap.data()
  return { ...data, id: snap.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
}

export async function deleteBatch(id: string): Promise<void> {
  const db = getFirebaseDb()
  // Soft delete — preserve financial/issues data for audit trail
  await setDoc(
    doc(db, 'importBatches', id),
    { isDeleted: true, deletedAt: toTimestamp(new Date()) },
    { merge: true }
  )
}

export async function batchExistsByHash(fileHash: string): Promise<string | null> {
  const db = getFirebaseDb()
  const q = query(
    collection(db, 'importBatches'),
    where('fileHash', '==', fileHash),
    limit(1)
  )
  const snap = await getDocs(q)
  return snap.empty ? null : snap.docs[0].id
}

export async function getBatchesByInstitution(institutionId: string): Promise<ImportBatch[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(
      collection(db, 'importBatches'),
      where('institutionId', '==', institutionId),
      orderBy('uploadedAt', 'desc')
    )
  )
  return snap.docs
    .map((d) => {
      const data = d.data()
      return { ...data, id: d.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
    })
    .filter((b) => b.isDeleted !== true)
}

// Deaktivira sve batcheve institucije i postavlja novi kao aktivan.
// Pozivati kod svakog novog uvoza za istu instituciju.
export async function activateBatch(batchId: string, institutionId: string): Promise<void> {
  const db = getFirebaseDb()
  const existing = await getDocs(
    query(
      collection(db, 'importBatches'),
      where('institutionId', '==', institutionId),
      where('isActive', '==', true)
    )
  )
  const wb = writeBatch(db)
  existing.docs.forEach((d) => {
    if (d.id !== batchId) wb.update(d.ref, { isActive: false })
  })
  wb.update(doc(db, 'importBatches', batchId), { isActive: true })
  await wb.commit()
}

// Označava batch kao SUPERSEDED i aktivira zamjenski batch.
export async function supersedeBatch(
  oldBatchId: string,
  newBatchId: string,
  institutionId: string
): Promise<void> {
  const db = getFirebaseDb()
  const wb = writeBatch(db)
  wb.update(doc(db, 'importBatches', oldBatchId), {
    isActive: false,
    processingStatus: 'superseded',
  })
  wb.update(doc(db, 'importBatches', newBatchId), {
    isActive: true,
    supersedesId: oldBatchId,
  })
  await wb.commit()
  // Deaktiviraj sve ostale aktivne batcheve iste institucije
  const others = await getDocs(
    query(
      collection(db, 'importBatches'),
      where('institutionId', '==', institutionId),
      where('isActive', '==', true)
    )
  )
  if (!others.empty) {
    const wb2 = writeBatch(db)
    others.docs.forEach((d) => {
      if (d.id !== newBatchId) wb2.update(d.ref, { isActive: false })
    })
    await wb2.commit()
  }
}

// Označava grešku/upozorenje kao riješeno s audit trakom.
// Kad je fieldName === 'oib', automatski ažurira i institution.oib.
export async function resolveIssue(
  issueId: string,
  resolvedBy: string,
  resolvedMethod: IssueResolutionMethod,
  correctedValue?: string,
  resolutionNote?: string,
  meta?: { batchId: string; severity: 'error' | 'warning'; fieldName?: string }
): Promise<void> {
  const db = getFirebaseDb()
  await setDoc(
    doc(db, 'importIssues', issueId),
    {
      resolvedAt: toTimestamp(new Date()),
      resolvedBy,
      resolvedMethod,
      ...(correctedValue !== undefined ? { correctedValue } : {}),
      ...(resolutionNote ? { resolutionNote } : {}),
    },
    { merge: true }
  )
  if (meta) {
    const field = meta.severity === 'error' ? 'errorCount' : 'warningCount'
    await updateDoc(doc(db, 'importBatches', meta.batchId), { [field]: increment(-1) })

    // Propagiraj ispravak na institution (fieldName je case-insensitive, npr. 'OIB' ili 'Naziv tijela')
    const fn = meta.fieldName?.toLowerCase()
    if (correctedValue && (fn === 'oib' || fn === 'naziv tijela')) {
      const batchSnap = await getDoc(doc(db, 'importBatches', meta.batchId))
      const institutionId = batchSnap.data()?.institutionId as string | undefined
      if (institutionId) {
        const instUpdate: Record<string, string> = {}
        if (fn === 'oib') instUpdate.oib = correctedValue
        if (fn === 'naziv tijela') instUpdate.name = correctedValue
        await updateDoc(doc(db, 'institutions', institutionId), instUpdate)
      }
    }
  }
}

// Označava sve NP varijante u batchu kao riješene i normalizira vrijednosti.
export async function normalizeIssues(
  batchIds: string[],
  resolvedBy: string
): Promise<number> {
  const db = getFirebaseDb()
  const NP_VARIANTS = ['------', 'N/A', 'n.a.', 'n/p', 'N/P', 'n.a', 'N.A.', 'N.A', 'n/a']
  let total = 0
  for (const batchId of batchIds) {
    const issuesSnap = await getDocs(
      query(
        collection(db, 'importIssues'),
        where('batchId', '==', batchId),
        where('severity', '==', 'warning')
      )
    )
    const toResolve = issuesSnap.docs.filter((d) =>
      NP_VARIANTS.includes(d.data().originalValue)
    )
    const CHUNK = 400
    for (let i = 0; i < toResolve.length; i += CHUNK) {
      const wb = writeBatch(db)
      toResolve.slice(i, i + CHUNK).forEach((d) => {
        wb.update(d.ref, {
          resolvedAt: toTimestamp(new Date()),
          resolvedBy,
          resolvedMethod: 'BULK_NORMALIZE' as IssueResolutionMethod,
          correctedValue: 'NP',
        })
      })
      await wb.commit()
    }
    total += toResolve.length
  }
  return total
}

// Povezuje batch bez institucije s postojećom ili novom institucijom.
export async function linkBatchToInstitution(
  batchId: string,
  institutionId: string,
  resolvedBy: string
): Promise<void> {
  const db = getFirebaseDb()
  await setDoc(doc(db, 'importBatches', batchId), { institutionId }, { merge: true })

  // Označi sve greške tipa "Opći podaci" kao riješene
  const issuesSnap = await getDocs(
    query(collection(db, 'importIssues'), where('batchId', '==', batchId))
  )
  const toResolve = issuesSnap.docs.filter((d) =>
    d.data().message?.includes('Opći podaci') || d.data().fieldName === 'institutionId'
  )
  if (toResolve.length > 0) {
    const wb = writeBatch(db)
    toResolve.forEach((d) => {
      wb.update(d.ref, {
        resolvedAt: toTimestamp(new Date()),
        resolvedBy,
        resolvedMethod: 'LINKED_INSTITUTION' as IssueResolutionMethod,
        correctedValue: institutionId,
      })
    })
    await wb.commit()
  }
}

// ─── Financial Entries (bulk write) ─────────────────────────────
export async function saveFinancialEntries(entries: FinancialEntry[]): Promise<void> {
  const db = getFirebaseDb()
  const CHUNK = 400
  for (let i = 0; i < entries.length; i += CHUNK) {
    const batch = writeBatch(db)
    entries.slice(i, i + CHUNK).forEach((e) => {
      const ref = doc(collection(db, 'financialEntries'))
      batch.set(ref, { ...e, createdAt: toTimestamp(e.createdAt) })
    })
    await batch.commit()
  }
}

export async function getFinancialEntries(batchId: string): Promise<FinancialEntry[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'financialEntries'), where('batchId', '==', batchId))
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as FinancialEntry
  })
}

export async function getAllFinancialEntries(): Promise<FinancialEntry[]> {
  await reconcileLegacyActiveBatches()
  const db = getFirebaseDb()
  // Dohvaćamo samo unose iz aktivnih batcheva — svaka institucija ima max jedan aktivan
  const activeBatchesSnap = await getDocs(
    query(collection(db, 'importBatches'), where('isActive', '==', true))
  )
  if (activeBatchesSnap.empty) return []
  const activeBatchIds = activeBatchesSnap.docs.map((d) => d.id)
  const results: FinancialEntry[] = []
  const CHUNK = 10 // Firestore 'in' operator limit
  for (let i = 0; i < activeBatchIds.length; i += CHUNK) {
    const snap = await getDocs(
      query(collection(db, 'financialEntries'), where('batchId', 'in', activeBatchIds.slice(i, i + CHUNK)))
    )
    snap.docs.forEach((d) => {
      const data = d.data()
      results.push({ ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as FinancialEntry)
    })
  }
  return results
}

// ─── Import Issues ───────────────────────────────────────────────
export async function saveImportIssues(issues: ImportIssue[]): Promise<void> {
  const db = getFirebaseDb()
  const CHUNK = 400
  for (let i = 0; i < issues.length; i += CHUNK) {
    const batch = writeBatch(db)
    issues.slice(i, i + CHUNK).forEach((issue) => {
      const ref = doc(collection(db, 'importIssues'))
      batch.set(ref, { ...issue, createdAt: toTimestamp(issue.createdAt) })
    })
    await batch.commit()
  }
}

export async function getImportIssues(batchId: string): Promise<ImportIssue[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'importIssues'), where('batchId', '==', batchId))
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as ImportIssue
  })
}

export async function getAllImportIssues(severity?: 'error' | 'warning'): Promise<ImportIssue[]> {
  const db = getFirebaseDb()
  const constraints = severity
    ? [where('severity', '==', severity)]
    : []
  const snap = await getDocs(query(collection(db, 'importIssues'), ...constraints))
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as ImportIssue
  })
}

// Retroaktivno primijeni sve riješene OIB/naziv ispravke na institucije.
// Rješava slučajeve gdje je greška ispravljena prije fixa propagacije.
export async function reapplyResolvedIssues(): Promise<{ updated: number; skipped: number }> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'importIssues'), where('resolvedMethod', '==', 'MANUAL_EDIT'))
  )

  let updated = 0, skipped = 0
  const batchCache = new Map<string, string | null>() // batchId → institutionId

  for (const d of snap.docs) {
    const issue = d.data()
    const fn = (issue.fieldName as string | undefined)?.toLowerCase()
    const correctedValue = issue.correctedValue as string | undefined
    if (!correctedValue || (fn !== 'oib' && fn !== 'naziv tijela')) { skipped++; continue }

    let institutionId = batchCache.get(issue.batchId)
    if (institutionId === undefined) {
      const bSnap = await getDoc(doc(db, 'importBatches', issue.batchId))
      institutionId = (bSnap.data()?.institutionId as string | undefined) ?? null
      batchCache.set(issue.batchId, institutionId)
    }
    if (!institutionId) { skipped++; continue }

    const instSnap = await getDoc(doc(db, 'institutions', institutionId))
    if (!instSnap.exists()) { skipped++; continue }
    const inst = instSnap.data()

    const currentVal = fn === 'oib' ? inst.oib : inst.name
    if (currentVal === correctedValue) { skipped++; continue }

    const field = fn === 'oib' ? 'oib' : 'name'
    await updateDoc(doc(db, 'institutions', institutionId), { [field]: correctedValue })
    updated++
  }
  return { updated, skipped }
}

// ─── Installed Resources ─────────────────────────────────────────
export async function saveInstalledResources(resources: InstalledResource[]): Promise<void> {
  const db = getFirebaseDb()
  const CHUNK = 400
  for (let i = 0; i < resources.length; i += CHUNK) {
    const batch = writeBatch(db)
    resources.slice(i, i + CHUNK).forEach((r) => {
      const ref = doc(collection(db, 'installedResources'))
      batch.set(ref, { ...r, createdAt: toTimestamp(r.createdAt) })
    })
    await batch.commit()
  }
}

export async function getInstalledResources(batchId: string): Promise<InstalledResource[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'installedResources'), where('batchId', '==', batchId))
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as InstalledResource
  })
}

export async function getFinancialEntriesByInstitution(institutionId: string): Promise<FinancialEntry[]> {
  await reconcileLegacyActiveBatches()
  const db = getFirebaseDb()
  // Dohvaćamo samo unose iz aktivnog batcha — prikazuje se ono što ulazi u izvješće
  const activeBatchSnap = await getDocs(
    query(
      collection(db, 'importBatches'),
      where('institutionId', '==', institutionId),
      where('isActive', '==', true),
      limit(1)
    )
  )
  if (activeBatchSnap.empty) return []
  const activeBatchId = activeBatchSnap.docs[0].id
  const snap = await getDocs(
    query(collection(db, 'financialEntries'), where('batchId', '==', activeBatchId))
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as FinancialEntry
  })
}

export async function getInstalledResourcesByInstitution(institutionId: string): Promise<InstalledResource[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'installedResources'), where('institutionId', '==', institutionId))
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as InstalledResource
  })
}

export async function getImportIssuesByInstitution(institutionId: string): Promise<ImportIssue[]> {
  const batches = await getBatchesByInstitution(institutionId)
  if (batches.length === 0) return []
  const db = getFirebaseDb()
  const batchIds = batches.map((b) => b.id!)
  const results: ImportIssue[] = []
  const CHUNK = 10
  for (let i = 0; i < batchIds.length; i += CHUNK) {
    const snap = await getDocs(
      query(collection(db, 'importIssues'), where('batchId', 'in', batchIds.slice(i, i + CHUNK)))
    )
    snap.docs.forEach((d) => {
      const data = d.data()
      results.push({ ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as ImportIssue)
    })
  }
  return results
}

// ─── Audit Logs ──────────────────────────────────────────────────
export async function addAuditLog(log: AuditLog): Promise<void> {
  const db = getFirebaseDb()
  await addDoc(collection(db, 'auditLogs'), {
    ...log,
    timestamp: toTimestamp(log.timestamp),
  })
}

export async function getAuditLogs(limitCount = 100): Promise<AuditLog[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(limitCount))
  )
  return snap.docs.map(d => {
    const data = d.data()
    return { ...data, id: d.id, timestamp: fromTimestamp(data.timestamp) } as AuditLog
  })
}

export async function getBatchesPaginated(params: PaginationParams): Promise<PaginatedResult<ImportBatch>> {
  const all = await getBatches()
  const start = params.page * params.pageSize
  const items = all.slice(start, start + params.pageSize)
  return { items, total: all.length, hasMore: start + params.pageSize < all.length }
}

// ─── Share Links ─────────────────────────────────────────────────
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Timestamp || value instanceof Date) return value
  if (Array.isArray(value)) {
    return value
      .map(stripUndefinedDeep)
      .filter(item => item !== undefined)
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, stripUndefinedDeep(item)] as const)
      .filter(([, item]) => item !== undefined)
  )
}

function shareToDoc(link: ShareLink): Record<string, unknown> {
  const { id: _id, ...rest } = link
  return stripUndefinedDeep({
    ...rest,
    createdAt: toTimestamp(link.createdAt),
    expiresAt: toTimestamp(link.expiresAt),
    lastViewedAt: link.lastViewedAt ? toTimestamp(link.lastViewedAt) : null,
    snapshot: {
      ...link.snapshot,
      institutions: link.snapshot.institutions.map(inst => ({
        ...inst,
        createdAt: toTimestamp(inst.createdAt),
        updatedAt: toTimestamp(inst.updatedAt),
      })),
      batches: link.snapshot.batches?.map(b => ({
        ...b,
        uploadedAt: toTimestamp(b.uploadedAt),
      })),
      entries: link.snapshot.entries.map(e => ({
        ...e,
        createdAt: toTimestamp(e.createdAt),
      })),
      resources: link.snapshot.resources?.map(r => ({
        ...r,
        createdAt: toTimestamp(r.createdAt),
      })),
    },
  }) as Record<string, unknown>
}

function shareFromDoc(id: string, data: Record<string, unknown>): ShareLink {
  const snap = data.snapshot as Record<string, unknown>
  return {
    id,
    token: data.token as string,
    type: data.type as ShareLink['type'],
    title: data.title as string,
    description: data.description as string | undefined,
    createdAt: fromTimestamp(data.createdAt as Timestamp),
    createdBy: data.createdBy as string,
    createdByEmail: data.createdByEmail as string | undefined,
    expiresAt: fromTimestamp(data.expiresAt as Timestamp),
    viewCount: (data.viewCount as number) ?? 0,
    lastViewedAt: data.lastViewedAt ? fromTimestamp(data.lastViewedAt as Timestamp) : null,
    snapshot: {
      filters: snap.filters as ShareLink['snapshot']['filters'],
      institutions: ((snap.institutions as Record<string, unknown>[]) ?? []).map(i => ({
        ...i,
        createdAt: fromTimestamp(i.createdAt as Timestamp),
        updatedAt: fromTimestamp(i.updatedAt as Timestamp),
      })) as ShareLink['snapshot']['institutions'],
      batches: ((snap.batches as Record<string, unknown>[]) ?? undefined)?.map(b => ({
        ...b,
        uploadedAt: fromTimestamp(b.uploadedAt as Timestamp),
      })) as ShareLink['snapshot']['batches'],
      entries: ((snap.entries as Record<string, unknown>[]) ?? []).map(e => ({
        ...e,
        createdAt: fromTimestamp(e.createdAt as Timestamp),
      })) as ShareLink['snapshot']['entries'],
      resources: ((snap.resources as Record<string, unknown>[]) ?? undefined)?.map(r => ({
        ...r,
        createdAt: fromTimestamp(r.createdAt as Timestamp),
      })) as ShareLink['snapshot']['resources'],
    },
  }
}

export async function createShareLink(link: ShareLink): Promise<string> {
  const db = getFirebaseDb()
  const ref = await addDoc(collection(db, 'shareLinks'), shareToDoc(link))
  return ref.id
}

export async function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  const db = getFirebaseDb()
  const snap = await getDocs(query(collection(db, 'shareLinks'), where('token', '==', token), limit(1)))
  if (snap.empty) return null
  const d = snap.docs[0]
  return shareFromDoc(d.id, d.data())
}

export async function listShareLinks(): Promise<ShareLink[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(query(collection(db, 'shareLinks'), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => shareFromDoc(d.id, d.data()))
}

export async function deleteShareLink(id: string): Promise<void> {
  const db = getFirebaseDb()
  await deleteDoc(doc(db, 'shareLinks', id))
}

export async function recordShareView(id: string): Promise<void> {
  const db = getFirebaseDb()
  await updateDoc(doc(db, 'shareLinks', id), {
    viewCount: increment(1),
    lastViewedAt: toTimestamp(new Date()),
  })
}
