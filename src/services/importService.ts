import { parseWorkbook } from '../excel/parseWorkbook'
import type { RawSheet } from '../excel/parseWorkbook'
import { mapOpcePodaci, mapFinancialSheet, mapResursi } from '../excel/sheetMappers'
import { getProvider } from '../providers'
import { currentUser } from './authService'
import type { ImportBatch } from '../models/importBatch'
import type { ImportIssue } from '../models/financialEntry'

export type ImportStep =
  | 'hash'
  | 'duplicate_check'
  | 'parse'
  | 'validate'
  | 'save'
  | 'done'
  | 'error'

export interface ImportProgress {
  step: ImportStep
  message: string
}

export interface ImportResult {
  batchId: string
  errorCount: number
  warningCount: number
  financialEntriesCount: number
  installedResourcesCount: number
  institutionName: string
}

// ─── Preview (bez spremanja u Firestore) ─────────────────────────
export interface FilePreview {
  fileName: string
  fileSize: number
  fileHash: string
  institutionName: string
  institutionOib: string
  contactName: string
  estimatedEntries: number
  estimatedResources: number
  missingSheets: string[]
  isDuplicate: boolean
  duplicateBatchId: string | null
}

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}


function normalizeScope(v: string | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

function sameBatchScope(a: ImportBatch, institutionName: string, fileName: string): boolean {
  const aScope = normalizeScope(a.importSummary?.institutionName || a.fileName)
  const bScope = normalizeScope(institutionName || fileName)
  return aScope !== '' && bScope !== '' && aScope === bScope
}

function countDataRows(sheet: RawSheet): number {
  return sheet.slice(2).filter(row => row && String(row[0] ?? '').trim()).length
}

export async function previewFile(file: File): Promise<FilePreview> {
  const buffer = await file.arrayBuffer()

  const fileHash = await hashBuffer(buffer)
  const duplicateBatchId = await getProvider().batchExistsByHash(fileHash)
  const workbook = parseWorkbook(buffer)

  const { institution } = mapOpcePodaci(workbook.opcePodaci, '')

  const YEAR_COLS = 6
  const estimatedEntries = [
    workbook.capex, workbook.odrzavanje, workbook.operativni,
    workbook.licence, workbook.cloud,
  ].reduce((s, sh) => s + countDataRows(sh) * YEAR_COLS, 0)

  const { resources } = mapResursi(workbook.resursi, '', '')

  return {
    fileName:           file.name,
    fileSize:           file.size,
    fileHash,
    institutionName:    institution?.name        ?? '',
    institutionOib:     institution?.oib         ?? '',
    contactName:        institution?.contactName ?? '',
    estimatedEntries,
    estimatedResources: resources.length,
    missingSheets:      workbook.missingSheets,
    isDuplicate:        duplicateBatchId !== null,
    duplicateBatchId,
  }
}

export async function runImport(
  file: File,
  onProgress: (p: ImportProgress) => void,
  force = false          // true = preskoči provjeru duplikata
): Promise<ImportResult> {
  const user = currentUser()
  if (!user) throw new Error('Korisnik nije prijavljen')

  // 1. Hash
  onProgress({ step: 'hash', message: 'Računam hash datoteke...' })
  const buffer = await file.arrayBuffer()
  const fileHash = await hashBuffer(buffer)

  // 2. Duplicate check
  onProgress({ step: 'duplicate_check', message: 'Provjeravam duplikate...' })
  if (!force) {
    const existingId = await getProvider().batchExistsByHash(fileHash)
    if (existingId) {
      throw new Error(`Ova datoteka je već uvezena (batch ID: ${existingId})`)
    }
  }

  // 3. Parse Excel
  onProgress({ step: 'parse', message: 'Parsiram Excel datoteku...' })
  const workbook = parseWorkbook(buffer)

  // Create batch record (processing)
  const batchRecord: Omit<ImportBatch, 'id'> = {
    fileName: file.name,
    fileSize: file.size,
    fileHash,
    uploadedBy: user.uid,
    uploadedAt: new Date(),
    processingStatus: 'processing',
    warningCount: 0,
    errorCount: 0,
    storagePath: null,
    institutionId: '',
    templateVersion: '1.0',
    isActive: false,
    importSummary: {
      sheetsProcessed: [],
      financialEntriesCount: 0,
      installedResourcesCount: 0,
      institutionName: '',
    },
  }
  const provider = getProvider()
  const batchId = await provider.createBatch(batchRecord as ImportBatch)

  try {
    // 5. Map & validate
    onProgress({ step: 'validate', message: 'Validiram i mapiram podatke...' })

    const allIssues: Omit<ImportIssue, 'id'>[] = []

    // Missing sheets
    workbook.missingSheets.forEach((name) => {
      allIssues.push({
        batchId,
        severity: 'error',
        sheetName: name,
        rowLabel: '-',
        fieldName: '-',
        message: `List "${name}" nije pronađen u datoteci`,
        originalValue: '',
        createdAt: new Date(),
      })
    })

    // Opći podaci → institution
    const { institution, issues: instIssues } = mapOpcePodaci(workbook.opcePodaci, batchId)
    allIssues.push(...instIssues)
    const institutionId = institution ? await provider.upsertInstitution(institution) : ''
    const institutionName = institution?.name ?? ''

    // Financial sheets
    const financialSheetMap = [
      { rows: workbook.capex, group: 'CAPEX' as const, name: 'CAPEX infrastruktura' },
      { rows: workbook.odrzavanje, group: 'ODRZAVANJE' as const, name: 'Održavanje' },
      { rows: workbook.operativni, group: 'OPEX' as const, name: 'Operativni troškovi' },
      { rows: workbook.licence, group: 'LICENCE' as const, name: 'Licence i softver' },
      { rows: workbook.cloud, group: 'CLOUD' as const, name: 'Cloud trošak po pružatelju' },
    ]

    const allFinancialEntries = financialSheetMap.flatMap(({ rows, group, name }) => {
      const { entries, issues } = mapFinancialSheet(rows, group, name, batchId, institutionId)
      allIssues.push(...issues)
      return entries
    })

    const { resources, issues: resIssues } = mapResursi(
      workbook.resursi,
      batchId,
      institutionId
    )
    allIssues.push(...resIssues)

    // 6. Save to provider
    onProgress({ step: 'save', message: 'Spreman podataka...' })

    await provider.saveFinancialEntries(allFinancialEntries)
    await provider.saveInstalledResources(resources)
    await provider.saveImportIssues(allIssues)

    const errorCount = allIssues.filter((i) => i.severity === 'error').length
    const warningCount = allIssues.filter((i) => i.severity === 'warning').length

    let processingStatus: ImportBatch['processingStatus'] = 'completed'
    if (errorCount > 0) processingStatus = 'completed_with_errors'
    else if (warningCount > 0) processingStatus = 'completed_with_warnings'

    // Auto-supersede: ako institucija već ima aktivan batch, postavi stari kao superseded
    let supersededId: string | undefined
    if (institutionId) {
      const existing = await provider.getBatchesByInstitution(institutionId)
      const activeBatch = existing.find((b) => b.isActive && b.id !== batchId && sameBatchScope(b, institutionName, file.name))
      if (activeBatch?.id) {
        supersededId = activeBatch.id
        await provider.supersedeBatch(activeBatch.id, batchId, institutionId)
        await provider.addAuditLog({
          userId: user.uid,
          action: 'supersede_batch',
          entityType: 'importBatch',
          entityId: activeBatch.id,
          timestamp: new Date(),
          details: { newBatchId: batchId, institutionId },
        })
      }
    }

    await provider.updateBatch(batchId, {
      processingStatus,
      errorCount,
      warningCount,
      institutionId,
      isActive: !supersededId ? true : undefined,
      importSummary: {
        sheetsProcessed: financialSheetMap.map((s) => s.name),
        financialEntriesCount: allFinancialEntries.length,
        installedResourcesCount: resources.length,
        institutionName,
      },
    })

    await provider.addAuditLog({
      userId: user.uid,
      action: 'import_complete',
      entityType: 'importBatch',
      entityId: batchId,
      timestamp: new Date(),
      details: { fileName: file.name, errorCount, warningCount },
    })

    onProgress({ step: 'done', message: 'Import uspješno završen!' })

    return {
      batchId,
      errorCount,
      warningCount,
      financialEntriesCount: allFinancialEntries.length,
      installedResourcesCount: resources.length,
      institutionName,
    }
  } catch (err) {
    await provider.updateBatch(batchId, { processingStatus: 'failed' })
    await provider.addAuditLog({
      userId: user.uid,
      action: 'import_failed',
      entityType: 'importBatch',
      entityId: batchId,
      timestamp: new Date(),
      details: { fileName: file.name, error: String(err) },
    })
    throw err
  }
}
