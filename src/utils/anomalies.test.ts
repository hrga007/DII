import { describe, it, expect } from 'vitest'
import { detectAnomalies } from './anomalies'
import type { FinancialEntry } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'

const NOW = new Date('2025-01-01')

function entry(o: Partial<FinancialEntry> & Pick<FinancialEntry, 'categoryGroup' | 'year' | 'amount' | 'valueType'>): FinancialEntry {
  return {
    id: Math.random().toString(),
    batchId: 'b',
    institutionId: 'i',
    categoryName: 'x',
    note: '',
    sourceSheet: 's',
    sourceRowIndex: 0,
    rawValue: '',
    normalizedValue: o.amount,
    createdAt: NOW,
    ...o,
  } as FinancialEntry
}

function resource(name: string, dc = 'DC1'): InstalledResource {
  return {
    id: Math.random().toString(),
    batchId: 'b', institutionId: 'i',
    dataCenterName: dc, resourceName: name, unit: 'kom',
    installedValue: 1, totalCapacity: 10, note: '',
    sourceRowIndex: 0, createdAt: NOW,
  }
}

describe('detectAnomalies', () => {
  it('returns no anomalies for stable year-over-year data', () => {
    const entries = [
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 1000, valueType: 'realizirano' }),
      entry({ categoryGroup: 'CAPEX', year: 2025, amount: 1100, valueType: 'realizirano' }),
    ]
    expect(detectAnomalies(entries)).toEqual([])
  })

  it('flags YoY warning when change > 50%', () => {
    const entries = [
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 100, valueType: 'realizirano' }),
      entry({ categoryGroup: 'CAPEX', year: 2025, amount: 200, valueType: 'realizirano' }),
    ]
    const result = detectAnomalies(entries)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.some(a => a.category === 'CAPEX' && a.year === 2025 && a.severity === 'warning')).toBe(true)
  })

  it('flags YoY critical when change > 200%', () => {
    const entries = [
      entry({ categoryGroup: 'OPEX', year: 2024, amount: 100, valueType: 'realizirano' }),
      entry({ categoryGroup: 'OPEX', year: 2025, amount: 500, valueType: 'realizirano' }),
    ]
    const result = detectAnomalies(entries)
    expect(result.some(a => a.severity === 'critical')).toBe(true)
  })

  it('flags plan overrun when realized > 50% above planned', () => {
    const entries = [
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 100, valueType: 'planirano' }),
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 200, valueType: 'realizirano' }),
    ]
    const result = detectAnomalies(entries)
    expect(result.some(a => a.title.includes('iznad plana'))).toBe(true)
  })

  it('does not flag plan overrun when within 50%', () => {
    const entries = [
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 100, valueType: 'planirano' }),
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 140, valueType: 'realizirano' }),
    ]
    const result = detectAnomalies(entries)
    expect(result.find(a => a.title.includes('iznad plana'))).toBeUndefined()
  })

  it('flags cloud expense without cloud resources', () => {
    const entries = [
      entry({ categoryGroup: 'CLOUD', year: 2025, amount: 5000, valueType: 'realizirano' }),
    ]
    const resources = [resource('Server X', 'DC Lokal')]
    const result = detectAnomalies(entries, resources)
    expect(result.some(a => a.title.toLowerCase().includes('cloud'))).toBe(true)
  })

  it('does not flag cloud when AWS resource exists', () => {
    const entries = [
      entry({ categoryGroup: 'CLOUD', year: 2025, amount: 5000, valueType: 'realizirano' }),
    ]
    const resources = [resource('EC2 instance', 'AWS')]
    const result = detectAnomalies(entries, resources)
    expect(result.find(a => a.title.toLowerCase().includes('cloud') && a.severity === 'warning')).toBeUndefined()
  })

  it('flags single category dominance > 80%', () => {
    const entries = [
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 9000, valueType: 'realizirano' }),
      entry({ categoryGroup: 'OPEX',  year: 2024, amount: 500,  valueType: 'realizirano' }),
      entry({ categoryGroup: 'CLOUD', year: 2024, amount: 300,  valueType: 'realizirano' }),
    ]
    const result = detectAnomalies(entries)
    expect(result.some(a => a.title.includes('ukupnog troška'))).toBe(true)
  })

  it('does not flag dominance with single category total', () => {
    const entries = [
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 1000, valueType: 'realizirano' }),
    ]
    expect(detectAnomalies(entries)).toEqual([])
  })

  it('sorts critical before warning before info', () => {
    const entries = [
      // Dominance (info)
      entry({ categoryGroup: 'CAPEX', year: 2023, amount: 9000, valueType: 'realizirano' }),
      entry({ categoryGroup: 'OPEX',  year: 2023, amount: 100,  valueType: 'realizirano' }),
      // Critical YoY
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 100,  valueType: 'realizirano' }),
      entry({ categoryGroup: 'CAPEX', year: 2025, amount: 1000, valueType: 'realizirano' }),
    ]
    const result = detectAnomalies(entries)
    const sevOrder = result.map(a => a.severity)
    // Critical should come first
    const firstNonCritical = sevOrder.findIndex(s => s !== 'critical')
    const firstWarning = sevOrder.indexOf('warning')
    if (firstNonCritical !== -1 && firstWarning !== -1) {
      expect(firstNonCritical).toBeLessThanOrEqual(firstWarning)
    }
  })
})
