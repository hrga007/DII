import { parseWorkbook, computeFileHash } from '../excel/parseWorkbook'
import { mapOpcePodaci, mapFinancialSheet, mapResursi } from '../excel/sheetMappers'
import {
  batchExistsByHash,
  createBatch,
  updateBatch,
  upsertInstitution,
  saveFinancialEntries,
  saveImportIssues,
  saveInstalledResources,
  addAuditLog,
} from './firestoreService'
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

export async function runImport(
  file: File,
  onProgress: (p: ImportProgress) => void
): Promise<ImportResult> {
  const user = currentUser()
  if (!user) throw new Error('Korisnik nije prijavljen')

  // 1. Hash
  onProgress({ step: 'hash', message: 'Računam hash datoteke...' })
  const fileHash = await computeFileHash(file)

  // 2. Duplicate check
  onProgress({ step: 'duplicate_check', message: 'Provjeravam duplikate...' })
  const existingId = await batchExistsByHash(fileHash)
  if (existingId) {
    throw new Error(`Ova datoteka je već uvezena (batch ID: ${existingId})`)
  }

  // 3. Parse Excel
  onProgress({ step: 'parse', message: 'Parsiram Excel datoteku...' })
  const buffer = await file.arrayBuffer()
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
    importSummary: {
      sheetsProcessed: [],
      financialEntriesCount: 0,
      installedResourcesCount: 0,
      institutionName: '',
    },
  }
  const batchId = await createBatch(batchRecord as ImportBatch)

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
    const institutionId = institution ? await upsertInstitution(institution) : ''
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

    // 6. Save to Firestore
    onProgress({ step: 'save', message: 'Spreman podataka u Firestore...' })

    await saveFinancialEntries(allFinancialEntries)
    await saveInstalledResources(resources)
    await saveImportIssues(allIssues)

    const errorCount = allIssues.filter((i) => i.severity === 'error').length
    const warningCount = allIssues.filter((i) => i.severity === 'warning').length

    await updateBatch(batchId, {
      processingStatus: 'completed',
      errorCount,
      warningCount,
      institutionId,
      importSummary: {
        sheetsProcessed: financialSheetMap.map((s) => s.name),
        financialEntriesCount: allFinancialEntries.length,
        installedResourcesCount: resources.length,
        institutionName,
      },
    })

    await addAuditLog({
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
    await updateBatch(batchId, { processingStatus: 'failed' })
    await addAuditLog({
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
