import type { RawSheet } from './parseWorkbook'
import type { Institution } from '../models/institution'
import type { FinancialEntry, CategoryGroup, ImportIssue } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import { normalizeAmount, normalizeText } from './normalizers'
import { validateRequiredField, validateOIB, validateNumericOrSpecial } from './validators'
import type { ValidationContext } from './validators'

// ─── Opći podaci ──────────────────────────────────────────────────
export interface InstitutionMapResult {
  institution: Omit<Institution, 'id'> | null
  issues: Omit<ImportIssue, 'id'>[]
}

export function mapOpcePodaci(
  rows: RawSheet,
  batchId: string
): InstitutionMapResult {
  const ctx: ValidationContext = { batchId, sheetName: 'Opći podaci' }
  const issues: Omit<ImportIssue, 'id'>[] = []

  // Row 0 = headers, Row 1 = data
  const dataRow = rows[1]
  if (!dataRow) {
    issues.push({
      batchId,
      severity: 'error',
      sheetName: 'Opći podaci',
      rowLabel: 'R2',
      fieldName: 'Naziv tijela',
      message: 'List "Opći podaci" ne sadrži podatke',
      originalValue: '',
      createdAt: new Date(),
    })
    return { institution: null, issues }
  }

  const name = normalizeText(dataRow[0])
  const oib = normalizeText(dataRow[1])
  const contactName = normalizeText(dataRow[2])
  const contactEmail = normalizeText(dataRow[3])
  const dcCount = normalizeText(dataRow[4])

  const nameIssue = validateRequiredField(name, 'Naziv tijela', 'R2', ctx)
  if (nameIssue) issues.push(nameIssue)

  const oibIssue = validateRequiredField(oib, 'OIB', 'R2', ctx)
  if (oibIssue) issues.push(oibIssue)
  else {
    const oibFmtIssue = validateOIB(oib, ctx)
    if (oibFmtIssue) issues.push(oibFmtIssue)
  }

  const now = new Date()
  const institution: Omit<Institution, 'id'> = {
    name,
    oib,
    contactName,
    contactEmail,
    dcCount,
    createdAt: now,
    updatedAt: now,
  }

  return { institution, issues }
}

// ─── Financial sheets (generic mapper) ────────────────────────────
export interface FinancialMapResult {
  entries: Omit<FinancialEntry, 'id'>[]
  issues: Omit<ImportIssue, 'id'>[]
}

// Column layout (0-indexed):
//  0: category name
//  1: 2024 realized
//  2: 2025 realized
//  3: 2026 realized
//  4: 2026 planned
//  5: 2027 planned
//  6: 2028 planned
//  7: note
const YEAR_COLUMNS: { col: number; year: number; valueType: 'realizirano' | 'planirano' }[] = [
  { col: 1, year: 2024, valueType: 'realizirano' },
  { col: 2, year: 2025, valueType: 'realizirano' },
  { col: 3, year: 2026, valueType: 'realizirano' },
  { col: 4, year: 2026, valueType: 'planirano' },
  { col: 5, year: 2027, valueType: 'planirano' },
  { col: 6, year: 2028, valueType: 'planirano' },
]

export function mapFinancialSheet(
  rows: RawSheet,
  categoryGroup: CategoryGroup,
  sheetName: string,
  batchId: string,
  institutionId: string
): FinancialMapResult {
  const ctx: ValidationContext = { batchId, sheetName }
  const entries: Omit<FinancialEntry, 'id'>[] = []
  const issues: Omit<ImportIssue, 'id'>[] = []

  // Rows 0 and 1 are headers — data starts at row index 2
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const categoryName = normalizeText(row[0])
    if (!categoryName) continue // skip empty rows

    const note = normalizeText(row[7])
    const rowLabel = `R${i + 1}`

    for (const { col, year, valueType } of YEAR_COLUMNS) {
      const rawValue = row[col] ?? null
      const numIssue = validateNumericOrSpecial(rawValue, `${year} ${valueType}`, rowLabel, ctx)
      if (numIssue) issues.push(numIssue)

      const normalizedValue = normalizeAmount(rawValue)

      entries.push({
        batchId,
        institutionId,
        categoryGroup,
        categoryName,
        year,
        valueType,
        amount: normalizedValue,
        note,
        sourceSheet: sheetName,
        sourceRowIndex: i,
        rawValue: rawValue !== null ? String(rawValue) : null,
        normalizedValue,
        createdAt: new Date(),
      })
    }
  }

  return { entries, issues }
}

// ─── Trenutno instalirani resursi ──────────────────────────────────
export interface ResourceMapResult {
  resources: Omit<InstalledResource, 'id'>[]
  issues: Omit<ImportIssue, 'id'>[]
}

// Structure: DC header row (col 0 non-empty, rest empty), then column-header row, then data rows
// Repeated for each DC
export function mapResursi(
  rows: RawSheet,
  batchId: string,
  institutionId: string
): ResourceMapResult {
  const resources: Omit<InstalledResource, 'id'>[] = []
  const issues: Omit<ImportIssue, 'id'>[] = []

  let currentDC = ''

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const col0 = normalizeText(row[0])
    const col1 = normalizeText(row[1])
    const col2 = row[2]

    // DC header: has text in col0, rest empty/null, not a column-header row
    const isHeaderRow = col1.toLowerCase().includes('količina') || col0.toLowerCase() === 'stavka'
    const isDCHeader =
      col0 !== '' &&
      !isHeaderRow &&
      (col1 === '' || col1 === null) &&
      (col2 === '' || col2 === null)

    if (isDCHeader) {
      currentDC = col0
      continue
    }

    // Skip column-header rows
    if (isHeaderRow) continue

    // Data row: col0 = resource name, col1 = unit, col2 = installed, col3 = total, col4 = note
    if (!col0 || !currentDC) continue

    resources.push({
      batchId,
      institutionId,
      dataCenterName: currentDC,
      resourceName: col0,
      unit: col1,
      installedValue: col2 !== null ? col2 : '',
      totalCapacity: row[3] !== null ? (row[3] ?? '') : '',
      note: normalizeText(row[4]),
      sourceRowIndex: i,
      createdAt: new Date(),
    })
  }

  return { resources, issues }
}
