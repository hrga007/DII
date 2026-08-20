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
import { isSpecialValue, normalizeAmount } from '../excel/normalizers'
import { countUnresolvedIssuesByBatch } from '../utils/issueCounts'
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

async function applyCurrentIssueCounts(batches: ImportBatch[]): Promise<ImportBatch[]> {
  const batchIds = [...new Set(batches.map((b) => b.id).filter(Boolean) as string[])]
  if (batchIds.length === 0) return batches

  try {
    const db = getFirebaseDb()
    const issues: Pick<ImportIssue, 'batchId' | 'severity' | 'resolvedAt'>[] = []
    const CHUNK = 10
    for (let i = 0; i < batchIds.length; i += CHUNK) {
      const snap = await getDocs(
        query(collection(db, 'importIssues'), where('batchId', 'in', batchIds.slice(i, i + CHUNK)))
      )
      snap.docs.forEach((d) => {
        const data = d.data()
        issues.push({
          batchId: data.batchId,
          severity: data.severity,
          resolvedAt: data.resolvedAt,
        })
      })
    }

    const countsByBatch = countUnresolvedIssuesByBatch(issues)
    return batches.map((batch) => {
      if (!batch.id) return batch
      const counts = countsByBatch.get(batch.id)
      return {
        ...batch,
        errorCount: counts?.errorCount ?? 0,
        warningCount: counts?.warningCount ?? 0,
      }
    })
  } catch (err) {
    console.warn('Could not refresh issue counts for batches', err)
    return batches
  }
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

function toBatchLite(id: string, data: Record<string, unknown>, institutionFallback?: string): BatchLite {
  return {
    id,
    institutionId: (data.institutionId as string | undefined) ?? institutionFallback,
    uploadedAt: fromTimestamp(data.uploadedAt as Timestamp),
    isActive: data.isActive as boolean | undefined,
    fileName: data.fileName as string | undefined,
    importSummary: data.importSummary as { institutionName?: string } | undefined,
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function financialEntryFromDoc(
  id: string,
  data: Record<string, unknown>,
  batchInstitutions?: Map<string, string>
): FinancialEntry {
  const batchId = data.batchId as string
  return {
    ...data,
    id,
    institutionId: batchInstitutions?.get(batchId) ?? data.institutionId,
    createdAt: fromTimestamp(data.createdAt as Timestamp),
  } as FinancialEntry
}

function installedResourceFromDoc(
  id: string,
  data: Record<string, unknown>,
  batchInstitutions?: Map<string, string>
): InstalledResource {
  const batchId = data.batchId as string
  return {
    ...data,
    id,
    institutionId: batchInstitutions?.get(batchId) ?? data.institutionId,
    createdAt: fromTimestamp(data.createdAt as Timestamp),
  } as InstalledResource
}

async function getActiveBatchInstitutionMap(institutionId?: string): Promise<Map<string, string>> {
  const db = getFirebaseDb()
  const constraints = institutionId
    ? [where('institutionId', '==', institutionId), where('isActive', '==', true)]
    : [where('isActive', '==', true)]
  const snap = await getDocs(query(collection(db, 'importBatches'), ...constraints))
  const batchInstitutions = new Map<string, string>()
  snap.docs.forEach((d) => {
    const data = d.data()
    if (data.isDeleted === true || !data.institutionId) return
    batchInstitutions.set(d.id, data.institutionId as string)
  })
  return batchInstitutions
}

async function reconcileLegacyActiveBatches(): Promise<void> {
  const db = getFirebaseDb()
  const snap = await getDocs(query(collection(db, 'importBatches'), orderBy('uploadedAt', 'desc')))
  if (snap.empty) return

  const byInstitution = new Map<string, BatchLite[]>()
  snap.docs.forEach((d) => {
    const data = d.data()
    if (data.isDeleted === true) return
    if (!data.institutionId) return
    const arr = byInstitution.get(data.institutionId) ?? []
    arr.push(toBatchLite(d.id, data))
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

  if (!snap.empty) {
    const id = snap.docs[0].id
    await setDoc(doc(db, 'institutions', id), {
      ...inst,
      createdAt: toTimestamp(inst.createdAt),
      updatedAt: toTimestamp(new Date()),
    })
    return id
  }

  const ref = await addDoc(collection(db, 'institutions'), {
    ...inst,
    createdAt: toTimestamp(inst.createdAt),
    updatedAt: toTimestamp(new Date()),
  })
  return ref.id
}

export async function patchInstitution(
  institutionId: string,
  fields: Partial<import('../models/institution').Institution>,
): Promise<void> {
  const db = getFirebaseDb()
  await updateDoc(doc(db, 'institutions', institutionId), { ...fields, updatedAt: toTimestamp(new Date()) })
}

function institutionFromData(id: string, data: Record<string, unknown>): Institution {
  return {
    id,
    name: data.name as string,
    oib: data.oib as string,
    contactName: data.contactName as string,
    contactEmail: data.contactEmail as string,
    dcCount: data.dcCount as string,
    ...(typeof data.notes === 'string' ? { notes: data.notes } : {}),
    createdAt: fromTimestamp(data.createdAt as Timestamp),
    updatedAt: fromTimestamp(data.updatedAt as Timestamp),
  }
}

export async function getInstitutions(): Promise<Institution[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(query(collection(db, 'institutions'), orderBy('name')))
  return snap.docs.map(d => institutionFromData(d.id, d.data()))
}

export async function getInstitutionById(id: string): Promise<Institution | null> {
  const db = getFirebaseDb()
  const snap = await getDoc(doc(db, 'institutions', id))
  if (!snap.exists()) return null
  return institutionFromData(snap.id, snap.data())
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
  const batches = snap.docs
    .map((d) => {
      const data = d.data()
      return { ...data, id: d.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
    })
    .filter((b) => b.isDeleted !== true)
  return applyCurrentIssueCounts(batches)
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
  const batches = snap.docs
    .map((d) => {
      const data = d.data()
      return { ...data, id: d.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
    })
    .filter((b) => b.isDeleted !== true)
  return applyCurrentIssueCounts(batches)
}

// Aktivira batch samo unutar istog scopea (institucija + naziv tijela/podruznica).
export async function activateBatch(batchId: string, institutionId: string): Promise<void> {
  const db = getFirebaseDb()
  const targetSnap = await getDoc(doc(db, 'importBatches', batchId))
  if (!targetSnap.exists()) return
  const targetScope = batchScopeKey(toBatchLite(batchId, targetSnap.data(), institutionId))

  const existing = await getDocs(
    query(
      collection(db, 'importBatches'),
      where('institutionId', '==', institutionId),
      where('isActive', '==', true)
    )
  )
  const wb = writeBatch(db)
  existing.docs.forEach((d) => {
    const data = d.data()
    if (d.id !== batchId && data.isDeleted !== true && batchScopeKey(toBatchLite(d.id, data)) === targetScope) {
      wb.update(d.ref, { isActive: false })
    }
  })
  wb.update(doc(db, 'importBatches', batchId), { isActive: true, institutionId })
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
    institutionId,
    supersedesId: oldBatchId,
  })
  await wb.commit()
}

async function refreshBatchIssueCounts(batchId: string): Promise<void> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'importIssues'), where('batchId', '==', batchId))
  )
  let errorCount = 0
  let warningCount = 0

  snap.docs.forEach((d) => {
    const data = d.data()
    if (data.resolvedAt) return
    if (data.severity === 'error') errorCount += 1
    if (data.severity === 'warning') warningCount += 1
  })

  await updateDoc(doc(db, 'importBatches', batchId), { errorCount, warningCount })
}

// Označava grešku/upozorenje kao riješeno s audit trakom.
// Kad je fieldName === 'oib', automatski ažurira i institution.oib.
const FINANCIAL_SHEET_NAMES = new Set([
  'CAPEX infrastruktura',
  'Održavanje',
  'Operativni troškovi',
  'Licence i softver',
  'Cloud trošak po pružatelju',
])

function parseFinancialIssueLocator(issue: Record<string, unknown>): {
  batchId: string
  sourceSheet: string
  sourceRowIndex: number
  year: number
  valueType: 'realizirano' | 'planirano'
} | null {
  const batchId = issue.batchId as string | undefined
  const sourceSheet = issue.sheetName as string | undefined
  const rowLabel = issue.rowLabel as string | undefined
  const fieldName = issue.fieldName as string | undefined
  if (!batchId || !sourceSheet || !rowLabel || !fieldName) return null
  if (!FINANCIAL_SHEET_NAMES.has(sourceSheet)) return null

  const fieldMatch = /^(\d{4})\s+(realizirano|planirano)$/i.exec(fieldName.trim())
  const rowMatch = /^R(\d+)$/i.exec(rowLabel.trim())
  if (!fieldMatch || !rowMatch) return null

  return {
    batchId,
    sourceSheet,
    sourceRowIndex: Number(rowMatch[1]) - 1,
    year: Number(fieldMatch[1]),
    valueType: fieldMatch[2].toLowerCase() as 'realizirano' | 'planirano',
  }
}

async function applyFinancialIssueCorrection(
  db: ReturnType<typeof getFirebaseDb>,
  issue: Record<string, unknown>,
  correctedValue: string
): Promise<void> {
  const locator = parseFinancialIssueLocator(issue)
  if (!locator) return

  const normalizedValue = normalizeAmount(correctedValue)
  if (normalizedValue === null && !isSpecialValue(correctedValue)) {
    throw new Error('Ispravljena vrijednost nije valjani broj niti oznaka NP/NE/-.')
  }

  const snap = await getDocs(
    query(collection(db, 'financialEntries'), where('batchId', '==', locator.batchId))
  )
  const matches = snap.docs.filter((d) => {
    const data = d.data()
    return data.sourceSheet === locator.sourceSheet &&
      data.sourceRowIndex === locator.sourceRowIndex &&
      data.year === locator.year &&
      data.valueType === locator.valueType
  })

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? 'Nije pronađen financijski zapis za ovu korekciju. Potreban je re-upload ili ručna provjera.'
        : 'Pronađeno je više financijskih zapisa za ovu korekciju. Potrebna je ručna provjera.'
    )
  }

  await updateDoc(matches[0].ref, {
    rawValue: correctedValue,
    amount: normalizedValue,
    normalizedValue,
  })
}

export async function resolveIssue(
  issueId: string,
  resolvedBy: string,
  resolvedMethod: IssueResolutionMethod,
  correctedValue?: string,
  resolutionNote?: string,
  meta?: { batchId: string; severity: 'error' | 'warning'; fieldName?: string }
): Promise<void> {
  const db = getFirebaseDb()
  const issueRef = doc(db, 'importIssues', issueId)
  const existingIssueSnap = await getDoc(issueRef)
  if (correctedValue !== undefined && resolvedMethod === 'MANUAL_EDIT') {
    if (!existingIssueSnap.exists()) throw new Error('Greška za korekciju nije pronađena.')
    await applyFinancialIssueCorrection(db, existingIssueSnap.data(), correctedValue)
  }

  await setDoc(
    issueRef,
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
    // Propagiraj ispravak na institution (fieldName je case-insensitive, npr. 'OIB' ili 'Naziv tijela')
    const fn = meta.fieldName?.toLowerCase()
    if (correctedValue && (fn === 'oib' || fn === 'naziv tijela')) {
      const batchSnap = await getDoc(doc(db, 'importBatches', meta.batchId))
      const institutionId = batchSnap.data()?.institutionId as string | undefined
      if (institutionId) {
        const instUpdate: Record<string, string | Timestamp> = { updatedAt: toTimestamp(new Date()) }
        if (fn === 'oib') instUpdate.oib = correctedValue
        if (fn === 'naziv tijela') instUpdate.name = correctedValue
        await updateDoc(doc(db, 'institutions', institutionId), instUpdate)
      }
    }
    await refreshBatchIssueCounts(meta.batchId)
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
    const toResolve = issuesSnap.docs.filter((d) => {
      const data = d.data()
      return !data.resolvedAt && NP_VARIANTS.includes(data.originalValue)
    })
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
    if (toResolve.length > 0) await refreshBatchIssueCounts(batchId)
    total += toResolve.length
  }
  return total
}

// Povezuje batch bez institucije s postojećom ili novom institucijom.
async function updateBatchChildrenInstitutionId(batchId: string, institutionId: string): Promise<void> {
  const db = getFirebaseDb()
  const childCollections = ['financialEntries', 'installedResources'] as const

  for (const childCollection of childCollections) {
    const snap = await getDocs(
      query(collection(db, childCollection), where('batchId', '==', batchId))
    )
    for (const docs of chunkArray(snap.docs, 400)) {
      const wb = writeBatch(db)
      docs.forEach((d) => wb.update(d.ref, { institutionId }))
      await wb.commit()
    }
  }
}

export async function linkBatchToInstitution(
  batchId: string,
  institutionId: string,
  resolvedBy: string
): Promise<void> {
  const db = getFirebaseDb()
  await setDoc(doc(db, 'importBatches', batchId), { institutionId }, { merge: true })
  await updateBatchChildrenInstitutionId(batchId, institutionId)

  // Označi sve greške tipa "Opći podaci" kao riješene
  const issuesSnap = await getDocs(
    query(collection(db, 'importIssues'), where('batchId', '==', batchId))
  )
  const toResolve = issuesSnap.docs.filter((d) => {
    const data = d.data()
    return !data.resolvedAt &&
      (data.message?.includes('Opći podaci') || data.fieldName === 'institutionId')
  })
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
    await refreshBatchIssueCounts(batchId)
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
  // Dohvacamo samo unose iz aktivnih, neobrisanih batcheva.
  const activeBatchInstitutions = await getActiveBatchInstitutionMap()
  const activeBatchIds = [...activeBatchInstitutions.keys()]
  if (activeBatchIds.length === 0) return []
  const results: FinancialEntry[] = []
  for (const ids of chunkArray(activeBatchIds, 10)) {
    const snap = await getDocs(
      query(collection(db, 'financialEntries'), where('batchId', 'in', ids))
    )
    snap.docs.forEach((d) => {
      const data = d.data()
      results.push(financialEntryFromDoc(d.id, data, activeBatchInstitutions))
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
    await updateDoc(doc(db, 'institutions', institutionId), {
      [field]: correctedValue,
      updatedAt: toTimestamp(new Date()),
    })
    updated++
  }
  return { updated, skipped }
}

export async function syncNamesFromRegistry(): Promise<{ updated: number; skipped: number; notFound: number }> {
  const { getRegistry } = await import('../utils/registryLoader')
  const registry = await getRegistry()

  const institutions = await getInstitutions()
  let updated = 0, skipped = 0, notFound = 0

  for (const inst of institutions) {
    if (!inst.oib) { skipped++; continue }
    const registryName = registry.byOib.get(inst.oib)?.naziv
    if (!registryName) { notFound++; continue }
    if (inst.name.trim() === registryName.trim()) { skipped++; continue }
    await patchInstitution(inst.id!, { name: registryName })
    updated++
  }
  return { updated, skipped, notFound }
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
  // Dohvacamo sve aktivne scopeove institucije, npr. vise podruznica pod istim OIB-om.
  const activeBatchInstitutions = await getActiveBatchInstitutionMap(institutionId)
  const activeBatchIds = [...activeBatchInstitutions.keys()]
  if (activeBatchIds.length === 0) return []

  const results: FinancialEntry[] = []
  for (const ids of chunkArray(activeBatchIds, 10)) {
    const snap = await getDocs(
      query(collection(db, 'financialEntries'), where('batchId', 'in', ids))
    )
    snap.docs.forEach((d) => {
      const data = d.data()
      results.push(financialEntryFromDoc(d.id, data, activeBatchInstitutions))
    })
  }
  return results
}

export async function getInstalledResourcesByInstitution(institutionId: string): Promise<InstalledResource[]> {
  await reconcileLegacyActiveBatches()
  const db = getFirebaseDb()
  const activeBatchInstitutions = await getActiveBatchInstitutionMap(institutionId)
  const activeBatchIds = [...activeBatchInstitutions.keys()]
  if (activeBatchIds.length === 0) return []

  const results: InstalledResource[] = []
  for (const ids of chunkArray(activeBatchIds, 10)) {
    const snap = await getDocs(
      query(collection(db, 'installedResources'), where('batchId', 'in', ids))
    )
    snap.docs.forEach((d) => {
      const data = d.data()
      results.push(installedResourceFromDoc(d.id, data, activeBatchInstitutions))
    })
  }
  return results
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
  const rest = { ...link }
  delete rest.id
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
      institutionClassifications: snap.institutionClassifications as ShareLink['snapshot']['institutionClassifications'],
      registrySource: snap.registrySource as ShareLink['snapshot']['registrySource'],
      resources: ((snap.resources as Record<string, unknown>[]) ?? undefined)?.map(r => ({
        ...r,
        createdAt: fromTimestamp(r.createdAt as Timestamp),
      })) as ShareLink['snapshot']['resources'],
    },
  }
}

export async function createShareLink(link: ShareLink): Promise<string> {
  const db = getFirebaseDb()
  const ref = doc(db, 'shareLinks', link.token)
  const existing = await getDoc(ref)
  if (existing.exists()) throw new Error('Share token already exists')
  await setDoc(ref, shareToDoc(link))
  return link.token
}

export async function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  const db = getFirebaseDb()
  const snap = await getDoc(doc(db, 'shareLinks', token))
  if (!snap.exists()) return null
  return shareFromDoc(snap.id, snap.data())
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
