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
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { AuditLog } from '../models/auditLog'

function toTimestamp(d: Date): Timestamp {
  return Timestamp.fromDate(d)
}

function fromTimestamp(t: Timestamp): Date {
  return t.toDate()
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
  const db = getFirebaseDb()
  const snap = await getDocs(collection(db, 'financialEntries'))
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: fromTimestamp(data.createdAt) } as FinancialEntry
  })
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

// ─── Batch aktivacija i supersede ────────────────────────────────
export async function getBatchesByInstitution(institutionId: string): Promise<ImportBatch[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(
    query(collection(db, 'importBatches'), where('institutionId', '==', institutionId))
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, id: d.id, uploadedAt: fromTimestamp(data.uploadedAt) } as ImportBatch
  })
}

export async function activateBatch(batchId: string, institutionId: string): Promise<void> {
  const db = getFirebaseDb()
  const existing = await getBatchesByInstitution(institutionId)
  const wb = writeBatch(db)
  for (const b of existing) {
    if (b.id && b.id !== batchId && b.isActive) {
      wb.update(doc(db, 'importBatches', b.id), { isActive: false })
    }
  }
  wb.update(doc(db, 'importBatches', batchId), { isActive: true })
  await wb.commit()
}

export async function supersedeBatch(
  oldBatchId: string,
  newBatchId: string,
  institutionId: string,
): Promise<void> {
  const db = getFirebaseDb()
  const wb = writeBatch(db)
  wb.update(doc(db, 'importBatches', oldBatchId), {
    processingStatus: 'superseded',
    isActive: false,
  })
  wb.update(doc(db, 'importBatches', newBatchId), {
    isActive: true,
    supersedesId: oldBatchId,
    institutionId,
  })
  await wb.commit()
}

// ─── Issue razrješavanje ─────────────────────────────────────────
export async function resolveIssue(
  issueId: string,
  resolvedBy: string,
  resolvedMethod: import('../models/financialEntry').IssueResolutionMethod,
  correctedValue?: string,
  resolutionNote?: string,
): Promise<void> {
  const db = getFirebaseDb()
  await setDoc(doc(db, 'importIssues', issueId), {
    resolvedAt: toTimestamp(new Date()),
    resolvedBy,
    resolvedMethod,
    ...(correctedValue !== undefined && { correctedValue }),
    ...(resolutionNote !== undefined && { resolutionNote }),
  }, { merge: true })
}

export async function normalizeIssues(batchIds: string[], resolvedBy: string): Promise<number> {
  const db = getFirebaseDb()
  const NP_PATTERN = /^(-{3,}|N\/A|n\.a\.|n\/p|n\/a|N\/P)$/i
  let count = 0
  for (const batchId of batchIds) {
    const snap = await getDocs(
      query(collection(db, 'importIssues'), where('batchId', '==', batchId), where('severity', '==', 'warning'))
    )
    const wb = writeBatch(db)
    for (const d of snap.docs) {
      const data = d.data()
      if (NP_PATTERN.test(String(data.originalValue ?? ''))) {
        wb.update(d.ref, {
          resolvedAt: toTimestamp(new Date()),
          resolvedBy,
          resolvedMethod: 'BULK_NORMALIZE',
          correctedValue: null,
          resolutionNote: 'Automatizirano: NP varijanta prepoznata kao N/A',
        })
        count++
      }
    }
    await wb.commit()
  }
  return count
}

export async function linkBatchToInstitution(
  batchId: string,
  institutionId: string,
  resolvedBy: string,
): Promise<void> {
  const db = getFirebaseDb()
  await setDoc(doc(db, 'importBatches', batchId), { institutionId }, { merge: true })
  const issuesSnap = await getDocs(
    query(collection(db, 'importIssues'), where('batchId', '==', batchId))
  )
  const CHUNK = 400
  const refs = issuesSnap.docs
    .filter((d) => d.data().fieldName === 'institutionId' || d.data().message?.includes('institucij'))
  for (let i = 0; i < refs.length; i += CHUNK) {
    const wb = writeBatch(db)
    refs.slice(i, i + CHUNK).forEach((d) =>
      wb.update(d.ref, {
        resolvedAt: toTimestamp(new Date()),
        resolvedBy,
        resolvedMethod: 'LINKED_INSTITUTION',
        correctedValue: institutionId,
      })
    )
    await wb.commit()
  }
}

// ─── Audit Logs ──────────────────────────────────────────────────
export async function addAuditLog(log: AuditLog): Promise<void> {
  const db = getFirebaseDb()
  await addDoc(collection(db, 'auditLogs'), {
    ...log,
    timestamp: toTimestamp(log.timestamp),
  })
}
