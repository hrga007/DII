import { describe, it, expect } from 'vitest'
import { filterAndSortRows } from './InstitutionsPage'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { ImportIssue } from '../models/financialEntry'
import { countUnresolvedIssuesByBatch } from '../utils/issueCounts'

const NOW = new Date('2025-01-01')

function makeInst(id: string, name: string, oib = '00000000000'): Institution {
  return { id, name, oib, contactName: '', contactEmail: '', dcCount: '0', notes: '', createdAt: NOW, updatedAt: NOW }
}

function makeBatch(id: string, institutionId: string, overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id,
    institutionId,
    fileName: `batch-${id}.xlsx`,
    fileHash: '',
    uploadedBy: 'user',
    uploadedAt: NOW,
    processingStatus: 'completed',
    warningCount: 0,
    errorCount: 0,
    fileSize: 1024,
    templateVersion: 'v1',
    isActive: false,
    storagePath: null,
    importSummary: { sheetsProcessed: [], financialEntriesCount: 0, installedResourcesCount: 0, institutionName: '' },
    ...overrides,
  }
}

function makeRow(
  institution: Institution,
  batches: ImportBatch[],
  lastUpload: Date | null = null,
) {
  const activeBatch = batches.find((b) => b.isActive) ?? null
  return {
    institution,
    batches,
    activeBatch,
    activeEntries: 0,
    lastUpload,
  }
}

function makeIssue(overrides: Partial<ImportIssue> = {}): ImportIssue {
  return {
    batchId: 'b1',
    severity: 'error',
    sheetName: 'Opći podaci',
    rowLabel: 'R2',
    fieldName: 'Naziv tijela',
    message: 'Test issue',
    originalValue: '',
    createdAt: NOW,
    ...overrides,
  }
}

describe('countUnresolvedIssuesByBatch', () => {
  it('counts only unresolved issues by batch', () => {
    const counts = countUnresolvedIssuesByBatch([
      makeIssue({ batchId: 'b1', severity: 'error' }),
      makeIssue({ batchId: 'b1', severity: 'warning' }),
      makeIssue({ batchId: 'b1', severity: 'error', resolvedAt: NOW }),
      makeIssue({ batchId: 'b2', severity: 'error' }),
    ])

    expect(counts.get('b1')).toEqual({ errorCount: 1, warningCount: 1 })
    expect(counts.get('b2')).toEqual({ errorCount: 1, warningCount: 0 })
  })
})

describe('filterAndSortRows', () => {
  const rows = [
    makeRow(makeInst('a', 'Alfa', '12345678901'), [
      makeBatch('b1', 'a', { isActive: true, errorCount: 2 }),
    ], new Date('2024-06-01')),
    makeRow(makeInst('b', 'Beta', '98765432100'), [], null),
    makeRow(makeInst('c', 'Gama'), [
      makeBatch('b2', 'c', { processingStatus: 'completed' }),
    ], new Date('2025-03-01')),
  ]

  it('sve returns all rows', () => {
    expect(filterAndSortRows(rows, '', 'sve', 'batches_desc')).toHaveLength(3)
  })

  it('filters by name search', () => {
    const result = filterAndSortRows(rows, 'alfa', 'sve', 'batches_desc')
    expect(result).toHaveLength(1)
    expect(result[0].institution.id).toBe('a')
  })

  it('filters by OIB', () => {
    const result = filterAndSortRows(rows, '98765', 'sve', 'batches_desc')
    expect(result).toHaveLength(1)
    expect(result[0].institution.id).toBe('b')
  })

  it('filter greske returns only rows with errors', () => {
    const result = filterAndSortRows(rows, '', 'greske', 'batches_desc')
    expect(result).toHaveLength(1)
    expect(result[0].institution.id).toBe('a')
  })

  it('filter nema_aktivnog returns rows with batches but no active', () => {
    const result = filterAndSortRows(rows, '', 'nema_aktivnog', 'batches_desc')
    expect(result).toHaveLength(1)
    expect(result[0].institution.id).toBe('c')
  })

  it('filter nema_batcha returns rows with no batches', () => {
    const result = filterAndSortRows(rows, '', 'nema_batcha', 'batches_desc')
    expect(result).toHaveLength(1)
    expect(result[0].institution.id).toBe('b')
  })

  it('sort abecedno returns alphabetical order', () => {
    const result = filterAndSortRows(rows, '', 'sve', 'abecedno')
    expect(result.map((r) => r.institution.name)).toEqual(['Alfa', 'Beta', 'Gama'])
  })

  it('sort batches_desc puts most batches first', () => {
    const result = filterAndSortRows(rows, '', 'sve', 'batches_desc')
    expect(result[0].batches.length).toBeGreaterThanOrEqual(result[1].batches.length)
  })

  it('sort datum_desc puts latest upload first', () => {
    const withDates = rows.filter((r) => r.lastUpload)
    const result = filterAndSortRows(withDates, '', 'sve', 'datum_desc')
    expect(result[0].lastUpload!.getTime()).toBeGreaterThanOrEqual(result[1].lastUpload!.getTime())
  })
})
