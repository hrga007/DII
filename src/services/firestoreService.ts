import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  limit,
} from 'firebase/firestore'
import { getFirebaseDb } from '../config/firebase'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue, IssueResolutionMethod } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { AuditLog } from '../models/auditLog'

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
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
  })
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

  // Cascade-delete all related documents in chunks of 400
  const SUB: [string, string][] = [
    ['financialEntries',  'batchId'],
    ['importIssues',      'batchId'],
    ['installedResources','batchId'],
  ]
  for (const [col, field] of SUB) {
    const snap = await getDocs(query(collection(db, col), where(field, '==', id)))
    const ids   = snap.docs.map(d => d.ref)
    const CHUNK = 400
    for (let i = 0; i < ids.length; i += CHUNK) {
      const wb = writeBatch(db)
      ids.slice(i, i + CHUNK).forEach(ref => wb.delete(ref))
      await wb.commit()
    }
  }

  // Finally delete the batch document itself
  await deleteDoc(doc(db, 'importBatches', id))
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
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
  })
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
export async function resolveIssue(
  issueId: string,
  resolvedBy: string,
  resolvedMethod: IssueResolutionMethod,
  correctedValue?: string,
  resolutionNote?: string
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
