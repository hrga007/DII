import { describe, it, expect } from 'vitest'
import { computeQualityScore, gradeColor } from './dataQuality'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'

const NOW = new Date()
const CURRENT_YEAR = NOW.getFullYear()

function inst(overrides: Partial<Institution> = {}): Institution {
  return {
    id: 'i1', name: 'Test', oib: '12345678901',
    contactName: '', contactEmail: '', dcCount: '0', notes: '',
    createdAt: NOW, updatedAt: NOW, ...overrides,
  }
}

function batch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: 'b' + Math.random(),
    institutionId: 'i1',
    fileName: 'x.xlsx', fileHash: '', uploadedBy: 'u',
    uploadedAt: NOW, processingStatus: 'completed',
    warningCount: 0, errorCount: 0, fileSize: 1, templateVersion: 'v1',
    isActive: false, storagePath: null,
    importSummary: { sheetsProcessed: [], financialEntriesCount: 0, installedResourcesCount: 0, institutionName: '' },
    ...overrides,
  }
}

function fEntry(year: number): FinancialEntry {
  return {
    id: 'e' + Math.random(), batchId: 'b', institutionId: 'i1',
    categoryGroup: 'CAPEX', categoryName: 'x', year, valueType: 'realizirano',
    amount: 100, note: '', sourceSheet: 's', sourceRowIndex: 0,
    rawValue: '100', normalizedValue: 100, createdAt: NOW,
  }
}

function issue(severity: 'error' | 'warning', resolved = false): ImportIssue {
  return {
    id: 'iss' + Math.random(), batchId: 'b', severity,
    sheetName: 's', rowLabel: 'r', fieldName: 'f', message: 'm',
    originalValue: '', createdAt: NOW,
    resolvedAt: resolved ? NOW : undefined,
  }
}

describe('computeQualityScore', () => {
  it('institution with no data scores low (D or F)', () => {
    const result = computeQualityScore({
      institution: inst({ oib: 'invalid' }),
      batches: [], entries: [], resources: [], issues: [],
    })
    expect(result.score).toBeLessThan(50)
    expect(['D', 'F']).toContain(result.grade)
  })

  it('institution with everything in order scores A', () => {
    const result = computeQualityScore({
      institution: inst({ contactName: 'X', contactEmail: 'x@y.hr' }),
      batches: [batch({ isActive: true })],
      entries: [fEntry(CURRENT_YEAR), fEntry(CURRENT_YEAR - 1)],
      resources: [{
        id: 'r1', batchId: 'b', institutionId: 'i1',
        dataCenterName: 'DC', resourceName: 'X', unit: 'k',
        installedValue: 1, totalCapacity: 10, note: '',
        sourceRowIndex: 0, createdAt: NOW,
      }],
      issues: [],
    })
    expect(result.score).toBeGreaterThanOrEqual(90)
    expect(result.grade).toBe('A')
  })

  it('penalizes invalid OIB', () => {
    const valid = computeQualityScore({
      institution: inst({ oib: '12345678901' }),
      batches: [batch({ isActive: true })], entries: [fEntry(CURRENT_YEAR)],
      resources: [], issues: [],
    })
    const invalid = computeQualityScore({
      institution: inst({ oib: '123' }),
      batches: [batch({ isActive: true })], entries: [fEntry(CURRENT_YEAR)],
      resources: [], issues: [],
    })
    expect(valid.score).toBeGreaterThan(invalid.score)
  })

  it('penalizes unresolved errors', () => {
    const clean = computeQualityScore({
      institution: inst(), batches: [batch({ isActive: true })],
      entries: [fEntry(CURRENT_YEAR)], resources: [], issues: [],
    })
    const dirty = computeQualityScore({
      institution: inst(), batches: [batch({ isActive: true })],
      entries: [fEntry(CURRENT_YEAR)], resources: [],
      issues: [issue('error'), issue('error'), issue('error')],
    })
    expect(clean.score).toBeGreaterThan(dirty.score)
  })

  it('does not penalize resolved issues', () => {
    const result = computeQualityScore({
      institution: inst(), batches: [batch({ isActive: true })],
      entries: [fEntry(CURRENT_YEAR)], resources: [],
      issues: [issue('error', true), issue('warning', true)],
    })
    const factor = result.factors.find(f => f.label.includes('grešaka'))
    expect(factor?.passed).toBe(true)
  })

  it('rewards multi-year data', () => {
    const single = computeQualityScore({
      institution: inst(), batches: [batch({ isActive: true })],
      entries: [fEntry(CURRENT_YEAR)], resources: [], issues: [],
    })
    const multi = computeQualityScore({
      institution: inst(), batches: [batch({ isActive: true })],
      entries: [fEntry(CURRENT_YEAR), fEntry(CURRENT_YEAR - 1), fEntry(CURRENT_YEAR - 2)],
      resources: [], issues: [],
    })
    expect(multi.score).toBeGreaterThan(single.score)
  })

  it('grade boundary: 90+ → A', () => {
    // Easy way to check: best possible setup
    const r = computeQualityScore({
      institution: inst({ contactEmail: 'x@y.hr' }),
      batches: [batch({ isActive: true })],
      entries: [fEntry(CURRENT_YEAR), fEntry(CURRENT_YEAR - 1)],
      resources: [{
        id: 'r1', batchId: 'b', institutionId: 'i1',
        dataCenterName: 'DC', resourceName: 'X', unit: 'k',
        installedValue: 1, totalCapacity: 10, note: '',
        sourceRowIndex: 0, createdAt: NOW,
      }],
      issues: [],
    })
    expect(r.grade).toBe('A')
  })

  it('returns 10 factors', () => {
    const r = computeQualityScore({
      institution: inst(), batches: [], entries: [], resources: [], issues: [],
    })
    expect(r.factors.length).toBe(10)
  })
})

describe('gradeColor', () => {
  it('returns distinct colors for each grade', () => {
    const grades = ['A', 'B', 'C', 'D', 'F'] as const
    const colors = grades.map(g => gradeColor(g).bg)
    expect(new Set(colors).size).toBe(grades.length)
  })
})
