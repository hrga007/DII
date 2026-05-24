import type { FinancialEntry, CategoryGroup } from '../models/financialEntry'
import type { Institution } from '../models/institution'

export const CATEGORIES: CategoryGroup[] = ['CAPEX', 'LICENCE', 'ODRZAVANJE', 'OPEX', 'CLOUD']

/**
 * Suma iznosa po (kategorija × godina).
 * Korisno za linijske grafikone — svaka kategorija je linija, godina je x-os.
 */
export function sumByCategoryYear(
  entries: FinancialEntry[],
  valueType: 'realizirano' | 'planirano' | 'oba' = 'oba',
): Map<CategoryGroup, Map<number, number>> {
  const result = new Map<CategoryGroup, Map<number, number>>()
  for (const e of entries) {
    if (valueType !== 'oba' && e.valueType !== valueType) continue
    const catMap = result.get(e.categoryGroup) ?? new Map<number, number>()
    catMap.set(e.year, (catMap.get(e.year) ?? 0) + (e.amount ?? 0))
    result.set(e.categoryGroup, catMap)
  }
  return result
}

/**
 * Suma po godinama (ukupno svih kategorija).
 */
export function sumByYear(
  entries: FinancialEntry[],
  valueType: 'realizirano' | 'planirano' | 'oba' = 'oba',
): Map<number, number> {
  const result = new Map<number, number>()
  for (const e of entries) {
    if (valueType !== 'oba' && e.valueType !== valueType) continue
    result.set(e.year, (result.get(e.year) ?? 0) + (e.amount ?? 0))
  }
  return result
}

/**
 * Postotak promjene s prošlom godinom. null ako nema prošle godine ili je dijeljeno s 0.
 */
export function yoyChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * Top N institucija po ukupnom iznosu za određene filtere.
 */
export function topInstitutions(
  entries: FinancialEntry[],
  institutions: Institution[],
  options: {
    year?: number | 'all'
    category?: CategoryGroup | 'all'
    valueType?: 'realizirano' | 'planirano' | 'oba'
    limit?: number
  } = {},
): { institution: Institution; total: number }[] {
  const { year = 'all', category = 'all', valueType = 'oba', limit = 10 } = options
  const totals = new Map<string, number>()
  for (const e of entries) {
    if (year !== 'all' && e.year !== year) continue
    if (category !== 'all' && e.categoryGroup !== category) continue
    if (valueType !== 'oba' && e.valueType !== valueType) continue
    if (!e.institutionId) continue
    totals.set(e.institutionId, (totals.get(e.institutionId) ?? 0) + (e.amount ?? 0))
  }
  const result: { institution: Institution; total: number }[] = []
  for (const [instId, total] of totals) {
    const inst = institutions.find((i) => i.id === instId)
    if (inst) result.push({ institution: inst, total })
  }
  result.sort((a, b) => b.total - a.total)
  return result.slice(0, limit)
}

/**
 * Usporedba dvije institucije po kategorijama za danu godinu.
 */
export interface ComparisonRow {
  category: CategoryGroup
  a: number
  b: number
  diff: number       // a - b
  diffPct: number | null  // (a-b)/b * 100
}

export function compareInstitutions(
  entries: FinancialEntry[],
  instAId: string,
  instBId: string,
  options: { year?: number | 'all'; valueType?: 'realizirano' | 'planirano' | 'oba' } = {},
): ComparisonRow[] {
  const { year = 'all', valueType = 'oba' } = options
  return CATEGORIES.map((category) => {
    const a = entries
      .filter((e) => e.institutionId === instAId && e.categoryGroup === category)
      .filter((e) => year === 'all' || e.year === year)
      .filter((e) => valueType === 'oba' || e.valueType === valueType)
      .reduce((s, e) => s + (e.amount ?? 0), 0)
    const b = entries
      .filter((e) => e.institutionId === instBId && e.categoryGroup === category)
      .filter((e) => year === 'all' || e.year === year)
      .filter((e) => valueType === 'oba' || e.valueType === valueType)
      .reduce((s, e) => s + (e.amount ?? 0), 0)
    return {
      category,
      a, b,
      diff: a - b,
      diffPct: yoyChange(a, b),
    }
  })
}
