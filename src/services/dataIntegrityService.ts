import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseDb } from '../config/firebase'
import { normalizeAmount } from '../excel/normalizers'

const CHUNK_SIZE = 400

type RawDoc = Record<string, unknown> & { id: string }

export type DataRepairKind = 'institutionIds' | 'issueCounts' | 'numericAmounts'
export type ManualFinancialAction = 'keep' | 'first' | 'sum' | 'manual'

export interface DataIntegritySummary {
  generatedAt: Date
  importBatches: number
  activeBatches: number
  financialEntries: number
  activeFinancialEntries: number
  installedResources: number
  importIssues: number
  unresolvedIssues: number
  institutionBackfills: number
  resourceBackfills: number
  issueCountRefreshes: number
  numericAmountRepairs: number
  manualFinancialReviews: number
  multipleActiveScopes: number
}

export interface DataIntegrityCandidate {
  id: string
  batchId?: string
  fileName?: string
  institutionId?: string
  currentValue?: unknown
  suggestedValue?: unknown
  details?: Record<string, unknown>
}

export interface ManualFinancialReview {
  entryId: string
  batchId: string
  fileName: string
  institutionId: string
  sourceSheet: string
  sourceRowIndex: number
  year: number
  valueType: string
  rawValue: string
  currentAmount: number | null
  currentNormalizedValue: number | null
  numberCandidates: number[]
  firstNumber: number | null
  sumNumbers: number | null
}

export interface ActiveScopeInfo {
  institutionId: string
  scopeCount: number
  batches: Array<{
    batchId: string
    fileName: string
    branchName: string
  }>
}

export interface DataIntegrityReport {
  summary: DataIntegritySummary
  multipleActiveScopes: ActiveScopeInfo[]
  institutionBackfills: DataIntegrityCandidate[]
  resourceBackfills: DataIntegrityCandidate[]
  issueCountRefreshes: DataIntegrityCandidate[]
  numericAmountRepairs: DataIntegrityCandidate[]
  manualFinancialReviews: ManualFinancialReview[]
}

function isDeleted(batch: RawDoc): boolean {
  return batch.isDeleted === true
}

function isActive(batch: RawDoc): boolean {
  return !isDeleted(batch) && batch.isActive === true
}

function normalizeScope(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function importSummary(batch: RawDoc): Record<string, unknown> {
  return (batch.importSummary as Record<string, unknown> | undefined) ?? {}
}

function batchScopeKey(batch: RawDoc): string {
  const institution = normalizeScope(batch.institutionId)
  const branch = normalizeScope(importSummary(batch).institutionName)
  const file = normalizeScope(batch.fileName)
  return `${institution}::${branch || file}`
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const list = grouped.get(key) ?? []
    list.push(item)
    grouped.set(key, list)
  }
  return grouped
}

function numbersEqual(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a == null && b == null
  return Math.abs(Number(a) - Number(b)) < 0.000001
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isReviewedFinancialEntry(entry: RawDoc): boolean {
  const resolution = entry.qualityResolution as Record<string, unknown> | undefined
  return resolution?.status === 'reviewed'
}

function extractNumberCandidates(raw: string): number[] {
  const normalized = raw.replace(/\u00a0/g, ' ')
  const matches = normalized.match(/[+-]?\d[\d\s.,']*/g) ?? []
  return matches
    .map((match) => normalizeAmount(match.trim()))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

async function readCollection(name: string): Promise<RawDoc[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(collection(db, name))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

async function readAuditData() {
  const [importBatches, financialEntries, installedResources, importIssues] = await Promise.all([
    readCollection('importBatches'),
    readCollection('financialEntries'),
    readCollection('installedResources'),
    readCollection('importIssues'),
  ])
  return { importBatches, financialEntries, installedResources, importIssues }
}

function buildReport(data: Awaited<ReturnType<typeof readAuditData>>): DataIntegrityReport {
  const { importBatches, financialEntries, installedResources, importIssues } = data
  const batchesById = new Map(importBatches.map((batch) => [batch.id, batch]))
  const activeBatches = importBatches.filter(isActive)
  const activeBatchIds = new Set(activeBatches.map((batch) => batch.id))
  const activeBatchesById = new Map(activeBatches.map((batch) => [batch.id, batch]))
  const nonDeletedBatches = importBatches.filter((batch) => !isDeleted(batch))
  const issuesByBatch = groupBy(importIssues, (issue) => String(issue.batchId ?? ''))

  const multipleActiveScopes: ActiveScopeInfo[] = []
  for (const [institutionId, institutionBatches] of groupBy(activeBatches, (batch) => String(batch.institutionId ?? ''))) {
    const scopeCount = new Set(institutionBatches.map(batchScopeKey)).size
    if (!institutionId || scopeCount <= 1) continue
    multipleActiveScopes.push({
      institutionId,
      scopeCount,
      batches: institutionBatches.map((batch) => ({
        batchId: batch.id,
        fileName: String(batch.fileName ?? ''),
        branchName: String(importSummary(batch).institutionName ?? ''),
      })),
    })
  }

  const institutionBackfills = financialEntries
    .filter((entry) => activeBatchIds.has(String(entry.batchId ?? '')))
    .map((entry) => ({ entry, batch: activeBatchesById.get(String(entry.batchId)) }))
    .filter(({ entry, batch }) => batch?.institutionId && entry.institutionId !== batch.institutionId)
    .map(({ entry, batch }) => ({
      id: entry.id,
      batchId: String(entry.batchId),
      fileName: String(batch?.fileName ?? ''),
      institutionId: String(batch?.institutionId ?? ''),
      currentValue: entry.institutionId ?? '',
      suggestedValue: batch?.institutionId ?? '',
      details: {
        sourceSheet: entry.sourceSheet,
        sourceRowIndex: entry.sourceRowIndex,
        year: entry.year,
        valueType: entry.valueType,
      },
    }))

  const resourceBackfills = installedResources
    .filter((resource) => activeBatchIds.has(String(resource.batchId ?? '')))
    .map((resource) => ({ resource, batch: activeBatchesById.get(String(resource.batchId)) }))
    .filter(({ resource, batch }) => batch?.institutionId && resource.institutionId !== batch.institutionId)
    .map(({ resource, batch }) => ({
      id: resource.id,
      batchId: String(resource.batchId),
      fileName: String(batch?.fileName ?? ''),
      institutionId: String(batch?.institutionId ?? ''),
      currentValue: resource.institutionId ?? '',
      suggestedValue: batch?.institutionId ?? '',
      details: {
        dataCenterName: resource.dataCenterName,
        resourceName: resource.resourceName,
      },
    }))

  const issueCountRefreshes = nonDeletedBatches
    .map((batch) => {
      const batchIssues = issuesByBatch.get(batch.id) ?? []
      const unresolved = batchIssues.filter((issue) => !issue.resolvedAt)
      const errorCount = unresolved.filter((issue) => issue.severity === 'error').length
      const warningCount = unresolved.filter((issue) => issue.severity === 'warning').length
      return {
        batch,
        errorCount,
        warningCount,
      }
    })
    .filter(({ batch, errorCount, warningCount }) =>
      Number(batch.errorCount ?? 0) !== errorCount || Number(batch.warningCount ?? 0) !== warningCount
    )
    .map(({ batch, errorCount, warningCount }) => ({
      id: batch.id,
      batchId: batch.id,
      fileName: String(batch.fileName ?? ''),
      institutionId: String(batch.institutionId ?? ''),
      currentValue: {
        errorCount: Number(batch.errorCount ?? 0),
        warningCount: Number(batch.warningCount ?? 0),
      },
      suggestedValue: { errorCount, warningCount },
    }))

  const numericAmountRepairs: DataIntegrityCandidate[] = []
  const manualFinancialReviews: ManualFinancialReview[] = []

  for (const entry of financialEntries) {
    if (isReviewedFinancialEntry(entry)) continue
    const rawValue = entry.rawValue
    const rawText = rawValue === null || rawValue === undefined ? '' : String(rawValue)
    const normalizedFromRaw = normalizeAmount(rawValue as string | number | null)
    const amount = numericValue(entry.amount)
    const normalizedValue = numericValue(entry.normalizedValue)
    const batch = batchesById.get(String(entry.batchId ?? ''))

    if (normalizedFromRaw !== null) {
      if (!numbersEqual(normalizedFromRaw, amount) || !numbersEqual(normalizedFromRaw, normalizedValue)) {
        numericAmountRepairs.push({
          id: entry.id,
          batchId: String(entry.batchId ?? ''),
          fileName: String(batch?.fileName ?? ''),
          institutionId: String(batch?.institutionId ?? entry.institutionId ?? ''),
          currentValue: { amount, normalizedValue, rawValue },
          suggestedValue: normalizedFromRaw,
          details: {
            sourceSheet: entry.sourceSheet,
            sourceRowIndex: entry.sourceRowIndex,
            year: entry.year,
            valueType: entry.valueType,
          },
        })
      }
      continue
    }

    if (!rawText.trim() || numbersEqual(amount, normalizedValue) === false) continue
    const numberCandidates = extractNumberCandidates(rawText)
    if (numberCandidates.length === 0) continue
    const sumNumbers = numberCandidates.reduce((sum, value) => sum + value, 0)
    manualFinancialReviews.push({
      entryId: entry.id,
      batchId: String(entry.batchId ?? ''),
      fileName: String(batch?.fileName ?? ''),
      institutionId: String(batch?.institutionId ?? entry.institutionId ?? ''),
      sourceSheet: String(entry.sourceSheet ?? ''),
      sourceRowIndex: Number(entry.sourceRowIndex ?? 0),
      year: Number(entry.year ?? 0),
      valueType: String(entry.valueType ?? ''),
      rawValue: rawText,
      currentAmount: amount,
      currentNormalizedValue: normalizedValue,
      numberCandidates,
      firstNumber: numberCandidates[0] ?? null,
      sumNumbers: numberCandidates.length > 0 ? sumNumbers : null,
    })
  }

  const activeFinancialEntries = financialEntries.filter((entry) => activeBatchIds.has(String(entry.batchId ?? '')))

  return {
    summary: {
      generatedAt: new Date(),
      importBatches: importBatches.length,
      activeBatches: activeBatches.length,
      financialEntries: financialEntries.length,
      activeFinancialEntries: activeFinancialEntries.length,
      installedResources: installedResources.length,
      importIssues: importIssues.length,
      unresolvedIssues: importIssues.filter((issue) => !issue.resolvedAt).length,
      institutionBackfills: institutionBackfills.length,
      resourceBackfills: resourceBackfills.length,
      issueCountRefreshes: issueCountRefreshes.length,
      numericAmountRepairs: numericAmountRepairs.length,
      manualFinancialReviews: manualFinancialReviews.length,
      multipleActiveScopes: multipleActiveScopes.length,
    },
    multipleActiveScopes,
    institutionBackfills,
    resourceBackfills,
    issueCountRefreshes,
    numericAmountRepairs,
    manualFinancialReviews,
  }
}

export async function runDataIntegrityAudit(): Promise<DataIntegrityReport> {
  return buildReport(await readAuditData())
}

async function writeAuditEvent(
  userId: string,
  action: 'data_quality_check' | 'data_quality_repair',
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const db = getFirebaseDb()
  await addDoc(collection(db, 'auditLogs'), {
    userId,
    action,
    entityType: 'dataQuality',
    entityId,
    timestamp: Timestamp.fromDate(new Date()),
    details,
  })
}

async function commitUpdates(
  collectionName: string,
  updates: Array<{ id: string; data: Record<string, unknown> }>,
): Promise<number> {
  const db = getFirebaseDb()
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE)
    const batch = writeBatch(db)
    for (const update of chunk) {
      batch.update(doc(db, collectionName, update.id), update.data)
    }
    await batch.commit()
  }
  return updates.length
}

export async function applyDataRepair(kind: DataRepairKind, userId: string): Promise<number> {
  const report = await runDataIntegrityAudit()
  let updated = 0

  if (kind === 'institutionIds') {
    updated += await commitUpdates(
      'financialEntries',
      report.institutionBackfills.map((candidate) => ({
        id: candidate.id,
        data: { institutionId: candidate.suggestedValue },
      })),
    )
    updated += await commitUpdates(
      'installedResources',
      report.resourceBackfills.map((candidate) => ({
        id: candidate.id,
        data: { institutionId: candidate.suggestedValue },
      })),
    )
  }

  if (kind === 'issueCounts') {
    updated = await commitUpdates(
      'importBatches',
      report.issueCountRefreshes.map((candidate) => ({
        id: candidate.id,
        data: candidate.suggestedValue as Record<string, unknown>,
      })),
    )
  }

  if (kind === 'numericAmounts') {
    updated = await commitUpdates(
      'financialEntries',
      report.numericAmountRepairs.map((candidate) => ({
        id: candidate.id,
        data: {
          amount: candidate.suggestedValue,
          normalizedValue: candidate.suggestedValue,
        },
      })),
    )
  }

  await writeAuditEvent(userId, 'data_quality_repair', kind, { kind, updated })
  return updated
}

export async function resolveManualFinancialReview(
  review: ManualFinancialReview,
  action: ManualFinancialAction,
  userId: string,
  manualAmount?: number,
): Promise<void> {
  const db = getFirebaseDb()
  const reviewedAt = Timestamp.fromDate(new Date())
  const resolution: Record<string, unknown> = {
    status: 'reviewed',
    method: action,
    reviewedAt,
    reviewedBy: userId,
    originalRawValue: review.rawValue,
    previousAmount: review.currentAmount,
  }

  const update: Record<string, unknown> = { qualityResolution: resolution }
  if (action === 'first' && review.firstNumber !== null) {
    update.amount = review.firstNumber
    update.normalizedValue = review.firstNumber
    resolution.appliedAmount = review.firstNumber
  }
  if (action === 'sum' && review.sumNumbers !== null) {
    update.amount = review.sumNumbers
    update.normalizedValue = review.sumNumbers
    resolution.appliedAmount = review.sumNumbers
  }
  if (action === 'manual') {
    if (manualAmount === undefined || !Number.isFinite(manualAmount)) {
      throw new Error('Ručno uneseni iznos nije valjan broj.')
    }
    update.amount = manualAmount
    update.normalizedValue = manualAmount
    resolution.appliedAmount = manualAmount
  }

  await updateDoc(doc(db, 'financialEntries', review.entryId), update)
  await writeAuditEvent(userId, 'data_quality_repair', review.entryId, {
    action,
    batchId: review.batchId,
    rawValue: review.rawValue,
    previousAmount: review.currentAmount,
    newAmount: update.amount ?? review.currentAmount,
  })
}

export async function recordDataQualityCheck(userId: string, report: DataIntegrityReport): Promise<void> {
  await writeAuditEvent(userId, 'data_quality_check', 'latest', {
    generatedAt: report.summary.generatedAt.toISOString(),
    institutionBackfills: report.summary.institutionBackfills,
    issueCountRefreshes: report.summary.issueCountRefreshes,
    numericAmountRepairs: report.summary.numericAmountRepairs,
    manualFinancialReviews: report.summary.manualFinancialReviews,
  })
}
