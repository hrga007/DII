import { describe, it, expect } from 'vitest'
import { auditDetailSummary, filterAuditLogs } from './AuditPage'
import type { AuditLog } from '../models/auditLog'

function makeLog(action: AuditLog['action'], timestamp: Date): AuditLog {
  return {
    id: `${action}-${timestamp.getTime()}`,
    userId: 'user1',
    action,
    entityType: 'importBatch',
    entityId: 'batch-1',
    timestamp,
    details: {},
  }
}

const logs: AuditLog[] = [
  makeLog('login',          new Date('2025-01-10')),
  makeLog('upload',         new Date('2025-02-15')),
  makeLog('import_complete',new Date('2025-03-01')),
  makeLog('delete_batch',   new Date('2025-04-20')),
]

describe('filterAuditLogs', () => {
  it('all returns all logs', () => {
    expect(filterAuditLogs(logs, 'all', '', '')).toHaveLength(4)
  })

  it('filters by action', () => {
    const result = filterAuditLogs(logs, 'upload', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('upload')
  })

  it('filters by dateFrom (inclusive)', () => {
    const result = filterAuditLogs(logs, 'all', '2025-03-01', '')
    expect(result).toHaveLength(2)
    result.forEach((l) => expect(l.timestamp.getTime()).toBeGreaterThanOrEqual(new Date('2025-03-01').getTime()))
  })

  it('filters by dateTo (inclusive to end of day)', () => {
    const result = filterAuditLogs(logs, 'all', '', '2025-02-15')
    expect(result).toHaveLength(2)
  })

  it('filters by dateFrom + dateTo range', () => {
    const result = filterAuditLogs(logs, 'all', '2025-02-01', '2025-03-31')
    expect(result).toHaveLength(2)
    expect(result.map((l) => l.action)).toEqual(expect.arrayContaining(['upload', 'import_complete']))
  })

  it('action + date combined filter', () => {
    const result = filterAuditLogs(logs, 'login', '2025-01-01', '2025-01-31')
    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('login')
  })

  it('returns empty when nothing matches', () => {
    expect(filterAuditLogs(logs, 'reupload', '', '')).toHaveLength(0)
  })
})

describe('auditDetailSummary', () => {
  it('prikazuje promjenu OIB-a i izvedene službene vrste tijela', () => {
    expect(auditDetailSummary({
      field: 'OIB',
      oldOib: '11111111111',
      newOib: '22222222222',
      oldClassification: { pravniStatus: 'Državna tijela' },
      newClassification: { pravniStatus: 'Trgovačka društva' },
    })).toBe(
      'OIB: 11111111111 → 22222222222 · Vrsta: Državna tijela → Trgovačka društva',
    )
  })
})
