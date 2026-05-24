import { describe, it, expect } from 'vitest'
import {
  sumByCategoryYear, sumByYear, yoyChange, topInstitutions, compareInstitutions,
} from './analytics'
import type { FinancialEntry } from '../models/financialEntry'
import type { Institution } from '../models/institution'

const NOW = new Date('2025-01-01')

function entry(o: Partial<FinancialEntry> & Pick<FinancialEntry, 'categoryGroup' | 'year' | 'amount'>): FinancialEntry {
  return {
    id: Math.random().toString(),
    batchId: 'b',
    institutionId: 'i',
    categoryName: 'x',
    valueType: 'realizirano',
    note: '',
    sourceSheet: 's',
    sourceRowIndex: 0,
    rawValue: '',
    normalizedValue: o.amount,
    createdAt: NOW,
    ...o,
  } as FinancialEntry
}

function inst(id: string, name: string): Institution {
  return { id, name, oib: '0', contactName: '', contactEmail: '', dcCount: '0', notes: '', createdAt: NOW, updatedAt: NOW }
}

describe('yoyChange', () => {
  it('returns null when previous is 0', () => {
    expect(yoyChange(100, 0)).toBeNull()
  })
  it('positive change', () => {
    expect(yoyChange(150, 100)).toBe(50)
  })
  it('negative change', () => {
    expect(yoyChange(50, 100)).toBe(-50)
  })
  it('zero change', () => {
    expect(yoyChange(100, 100)).toBe(0)
  })
  it('handles negative previous', () => {
    expect(yoyChange(50, -100)).toBe(150)
  })
})

describe('sumByYear', () => {
  const entries = [
    entry({ categoryGroup: 'CAPEX', year: 2024, amount: 100 }),
    entry({ categoryGroup: 'OPEX',  year: 2024, amount: 200 }),
    entry({ categoryGroup: 'CAPEX', year: 2025, amount: 300 }),
  ]

  it('sums all by year', () => {
    const r = sumByYear(entries)
    expect(r.get(2024)).toBe(300)
    expect(r.get(2025)).toBe(300)
  })

  it('filters by valueType', () => {
    const e2 = [
      ...entries,
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 500, valueType: 'planirano' }),
    ]
    expect(sumByYear(e2, 'realizirano').get(2024)).toBe(300)
    expect(sumByYear(e2, 'planirano').get(2024)).toBe(500)
  })
})

describe('sumByCategoryYear', () => {
  it('groups by category and year', () => {
    const r = sumByCategoryYear([
      entry({ categoryGroup: 'CAPEX', year: 2024, amount: 100 }),
      entry({ categoryGroup: 'CAPEX', year: 2025, amount: 200 }),
      entry({ categoryGroup: 'OPEX',  year: 2024, amount: 50 }),
    ])
    expect(r.get('CAPEX')?.get(2024)).toBe(100)
    expect(r.get('CAPEX')?.get(2025)).toBe(200)
    expect(r.get('OPEX')?.get(2024)).toBe(50)
  })
})

describe('topInstitutions', () => {
  const insts = [inst('a', 'Alfa'), inst('b', 'Beta'), inst('c', 'Gama')]
  const entries = [
    entry({ institutionId: 'a', categoryGroup: 'CAPEX', year: 2024, amount: 100 }),
    entry({ institutionId: 'b', categoryGroup: 'CAPEX', year: 2024, amount: 500 }),
    entry({ institutionId: 'c', categoryGroup: 'OPEX',  year: 2024, amount: 200 }),
    entry({ institutionId: 'a', categoryGroup: 'CAPEX', year: 2025, amount: 999 }),
  ]

  it('returns top N sorted descending', () => {
    const r = topInstitutions(entries, insts, { limit: 2 })
    expect(r).toHaveLength(2)
    expect(r[0].total).toBeGreaterThanOrEqual(r[1].total)
  })

  it('filters by year', () => {
    const r = topInstitutions(entries, insts, { year: 2024 })
    expect(r.find(x => x.institution.id === 'b')?.total).toBe(500)
    expect(r.find(x => x.institution.id === 'a')?.total).toBe(100)
  })

  it('filters by category', () => {
    const r = topInstitutions(entries, insts, { year: 2024, category: 'CAPEX' })
    expect(r.find(x => x.institution.id === 'c')).toBeUndefined()
  })

  it('skips institutions not in the list', () => {
    const r = topInstitutions(entries, [insts[0]], {})
    expect(r.every(x => x.institution.id === 'a')).toBe(true)
  })
})

describe('compareInstitutions', () => {
  const entries = [
    entry({ institutionId: 'a', categoryGroup: 'CAPEX', year: 2024, amount: 1000 }),
    entry({ institutionId: 'a', categoryGroup: 'OPEX',  year: 2024, amount: 500 }),
    entry({ institutionId: 'b', categoryGroup: 'CAPEX', year: 2024, amount: 800 }),
  ]

  it('returns one row per category', () => {
    const r = compareInstitutions(entries, 'a', 'b')
    expect(r.length).toBeGreaterThanOrEqual(5)
  })

  it('computes diff a - b', () => {
    const r = compareInstitutions(entries, 'a', 'b')
    const capex = r.find(x => x.category === 'CAPEX')!
    expect(capex.a).toBe(1000)
    expect(capex.b).toBe(800)
    expect(capex.diff).toBe(200)
  })

  it('diffPct null when b is 0', () => {
    const r = compareInstitutions(entries, 'a', 'b')
    const opex = r.find(x => x.category === 'OPEX')!
    expect(opex.b).toBe(0)
    expect(opex.diffPct).toBeNull()
  })
})
