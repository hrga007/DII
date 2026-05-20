import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { exportAuditToExcel, exportToExcel } from './exportUtils'
import type { FinancialEntry } from '../models/financialEntry'

vi.mock('xlsx', async (importActual) => {
  const actual = await importActual<typeof import('xlsx')>()
  return {
    ...actual,
    writeFile: vi.fn(),
  }
})

describe('exportAuditToExcel', () => {
  it('calls XLSX.writeFile with the given filename', () => {
    const logs = [
      {
        timestamp: new Date('2025-01-15T10:00:00Z'),
        userId: 'user123',
        action: 'upload',
        entityType: 'importBatch',
        entityId: 'batch-abc',
        details: { fileName: 'test.xlsx', size: 1024 },
      },
    ]
    exportAuditToExcel(logs, 'test-audit.xlsx')
    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), 'test-audit.xlsx')
  })

  it('produces a workbook with Audit log sheet', () => {
    const logs = [
      {
        timestamp: new Date('2025-03-01T08:00:00Z'),
        userId: 'u1',
        action: 'login',
        entityType: 'user',
        entityId: 'u1',
        details: {},
      },
    ]
    const bookNew = vi.spyOn(XLSX.utils, 'book_new')
    exportAuditToExcel(logs)
    expect(bookNew).toHaveBeenCalled()
  })

  it('handles empty log list without throwing', () => {
    expect(() => exportAuditToExcel([])).not.toThrow()
  })

  it('serialises nested details as flat key=value string', () => {
    const appendSheet = vi.spyOn(XLSX.utils, 'book_append_sheet')
    const jsonToSheet = vi.spyOn(XLSX.utils, 'json_to_sheet')
    const logs = [
      {
        timestamp: new Date(),
        userId: 'x',
        action: 'import_complete',
        entityType: 'importBatch',
        entityId: 'b1',
        details: { institutionId: 'inst-1', count: 42, nested: { a: 1 } },
      },
    ]
    exportAuditToExcel(logs)
    const rows = jsonToSheet.mock.calls[jsonToSheet.mock.calls.length - 1][0] as Record<string, unknown>[]
    expect(rows[0]['Detalji']).toContain('institutionId=inst-1')
    expect(rows[0]['Detalji']).toContain('count=42')
    expect(rows[0]['Detalji']).not.toContain('nested')
    expect(appendSheet).toHaveBeenCalled()
  })
})

describe('exportToExcel', () => {
  it('calls writeFile with .xlsx extension', () => {
    const entries: FinancialEntry[] = [
      {
        id: '1',
        batchId: 'b1',
        institutionId: 'i1',
        categoryGroup: 'CAPEX',
        categoryName: 'Serveri',
        year: 2025,
        valueType: 'planirano',
        amount: 100000,
        note: '',
        sourceSheet: 'Sheet1',
        sourceRowIndex: 2,
        rawValue: '100000',
        normalizedValue: 100000,
        createdAt: new Date(),
      },
    ]
    exportToExcel(entries, 'out.xlsx')
    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), 'out.xlsx')
  })
})
