import { describe, expect, it } from 'vitest'
import type { FinancialEntry } from '../models/financialEntry'
import type { Institution } from '../models/institution'
import {
  NEKATEGORIZIRANO,
  buildClassificationOptions,
  buildInstitutionClassificationMap,
  filterReportEntries,
  matchesClassificationFilters,
  pickInstitutionClassifications,
  serializeClassificationFilters,
  type ClassificationFilterState,
  type RegistryClassificationEntry,
} from './reportFilters'

const NOW = new Date('2026-01-01')

function institution(id: string, oib: string): Institution {
  return {
    id,
    name: `Institucija ${id}`,
    oib,
    contactName: '',
    contactEmail: '',
    dcCount: '0',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function entry(
  institutionId: string,
  overrides: Partial<FinancialEntry> = {},
): FinancialEntry {
  return {
    id: `${institutionId}-${overrides.year ?? 2026}-${overrides.categoryGroup ?? 'CAPEX'}`,
    batchId: 'batch',
    institutionId,
    categoryGroup: 'CAPEX',
    categoryName: 'Oprema',
    year: 2026,
    valueType: 'realizirano',
    amount: 100,
    note: '',
    sourceSheet: 'sheet',
    sourceRowIndex: 1,
    rawValue: 100,
    normalizedValue: 100,
    createdAt: NOW,
    ...overrides,
  }
}

function selections(overrides: Partial<ClassificationFilterState> = {}): ClassificationFilterState {
  return {
    pravniStatus: new Set<string>(),
    djelatnost: new Set<string>(),
    osnivac: new Set<string>(),
    ...overrides,
  }
}

const registryEntries: RegistryClassificationEntry[] = [
  {
    oib: '11111111111',
    pravniStatus: 'Državna tijela',
    djelatnost: 'Pravosuđe',
    osnivac: 'Republika Hrvatska',
  },
  {
    oib: '22222222222',
    pravniStatus: 'Trgovačka društva',
    djelatnost: 'Gospodarstvo',
    osnivac: 'Grad Zagreb',
  },
]

const registryByOib = new Map(registryEntries.map(registryEntry => [registryEntry.oib, registryEntry]))

describe('institution registry classifications', () => {
  it('joins the official registry by normalized OIB and keeps all three dimensions together', () => {
    const classifications = buildInstitutionClassificationMap(
      [institution('i1', ' 11111111111 '), institution('i2', '22222222222')],
      registryByOib,
    )

    expect(classifications.i1).toEqual({
      pravniStatus: 'Državna tijela',
      djelatnost: 'Pravosuđe',
      osnivac: 'Republika Hrvatska',
      registryMatched: true,
    })
    expect(classifications.i2.pravniStatus).toBe('Trgovačka društva')
  })

  it('uses an explicit Nekategorizirano value when no official OIB match exists', () => {
    const classifications = buildInstitutionClassificationMap(
      [institution('missing', ''), institution('unknown', '99999999999')],
      registryByOib,
    )

    expect(classifications.missing).toEqual({
      pravniStatus: NEKATEGORIZIRANO,
      djelatnost: NEKATEGORIZIRANO,
      osnivac: NEKATEGORIZIRANO,
      registryMatched: false,
    })
    expect(classifications.unknown.pravniStatus).toBe(NEKATEGORIZIRANO)
  })

  it('builds relevant options in official status order with Nekategorizirano last', () => {
    const classifications = buildInstitutionClassificationMap(
      [institution('i1', '11111111111'), institution('i2', '22222222222'), institution('i3', '')],
      registryByOib,
    )
    const options = buildClassificationOptions(
      classifications,
      {
        djelatnost: ['Zdravstvo'],
        osnivac: ['Fizička ili privatna pravna osoba'],
      },
      ['Trgovačka društva', 'Državna tijela'],
    )

    expect(options.pravniStatus).toEqual([
      'Trgovačka društva',
      'Državna tijela',
      NEKATEGORIZIRANO,
    ])
    expect(options.djelatnost.at(-1)).toBe(NEKATEGORIZIRANO)
    expect(options.djelatnost).toContain('Zdravstvo')
    expect(options.osnivac).toContain('Republika Hrvatska')
  })
})

describe('report classification filtering', () => {
  const institutions = [
    institution('state', '11111111111'),
    institution('company', '22222222222'),
    institution('uncategorized', ''),
  ]
  const classifications = buildInstitutionClassificationMap(institutions, registryByOib)
  const entries = [
    entry('state'),
    entry('state', { id: 'state-plan', valueType: 'planirano' }),
    entry('company', { id: 'company-opex', categoryGroup: 'OPEX' }),
    entry('uncategorized', { id: 'unknown-capex' }),
  ]

  it('combines classification dimensions with year/category/value and single-institution filters', () => {
    const result = filterReportEntries(entries, {
      year: 2026,
      categories: new Set(['CAPEX', 'OPEX']),
      valueType: 'realizirano',
      institutionId: 'state',
      classifications,
      classificationFilters: selections({
        pravniStatus: new Set(['Državna tijela']),
        djelatnost: new Set(['Pravosuđe']),
        osnivac: new Set(['Republika Hrvatska']),
      }),
    })

    expect(result.map(value => value.id)).toEqual(['state-2026-CAPEX'])
  })

  it('can explicitly select only uncategorized institutions', () => {
    const result = filterReportEntries(entries, {
      year: 'all',
      categories: new Set(['CAPEX', 'OPEX']),
      valueType: 'oba',
      institutionId: null,
      classifications,
      classificationFilters: selections({
        pravniStatus: new Set([NEKATEGORIZIRANO]),
      }),
    })

    expect(result.map(value => value.institutionId)).toEqual(['uncategorized'])
  })

  it('combines multiple selected values in one dimension with OR semantics', () => {
    const result = filterReportEntries(entries, {
      year: 'all',
      categories: new Set(['CAPEX', 'OPEX']),
      valueType: 'oba',
      institutionId: null,
      classifications,
      classificationFilters: selections({
        pravniStatus: new Set(['Državna tijela', 'Trgovačka društva']),
      }),
    })

    expect(new Set(result.map(value => value.institutionId))).toEqual(new Set(['state', 'company']))
  })

  it('ne spaja Državna tijela s Tijelima državne uprave', () => {
    expect(matchesClassificationFilters({
      pravniStatus: 'Tijela državne uprave',
      djelatnost: 'Javna uprava i politički sustav',
      osnivac: 'Republika Hrvatska',
      registryMatched: true,
    }, selections({
      pravniStatus: new Set(['Državna tijela']),
    }))).toBe(false)
  })

  it('treats empty classification selections as all values', () => {
    const result = filterReportEntries(entries, {
      year: 'all',
      categories: new Set(['CAPEX', 'OPEX']),
      valueType: 'oba',
      institutionId: null,
      classifications,
      classificationFilters: selections(),
    })

    expect(result).toHaveLength(entries.length)
  })

  it('serializes only active classification dimensions and snapshots only used institutions', () => {
    const filters = selections({ pravniStatus: new Set(['Državna tijela']) })
    expect(serializeClassificationFilters(filters)).toEqual({
      pravniStatusi: ['Državna tijela'],
      djelatnosti: undefined,
      osnivaci: undefined,
    })
    expect(Object.keys(pickInstitutionClassifications(classifications, new Set(['state'])))).toEqual(['state'])
  })
})
