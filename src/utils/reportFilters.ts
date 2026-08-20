import type { FinancialEntry, CategoryGroup } from '../models/financialEntry'
import type { Institution } from '../models/institution'
import { NEKATEGORIZIRANO } from './registryLoader'

export { NEKATEGORIZIRANO }

export type ClassificationDimension = 'pravniStatus' | 'djelatnost' | 'osnivac'

export interface InstitutionClassification {
  pravniStatus: string
  djelatnost: string
  osnivac: string
  registryMatched: boolean
}

export interface RegistryClassificationEntry {
  oib: string
  pravniStatus?: string
  djelatnost?: string
  osnivac?: string
}

export type InstitutionClassificationMap = Record<string, InstitutionClassification>

export interface ClassificationFilterState {
  pravniStatus: ReadonlySet<string>
  djelatnost: ReadonlySet<string>
  osnivac: ReadonlySet<string>
}

export type ClassificationOptions = Record<ClassificationDimension, string[]>

export interface ReportFilterState {
  year: number | 'all'
  categories: ReadonlySet<CategoryGroup>
  valueType: 'realizirano' | 'planirano' | 'oba'
  institutionId: string | null
  classifications: InstitutionClassificationMap
  classificationFilters: ClassificationFilterState
}

export function createEmptyClassificationFilters(): ClassificationFilterState {
  return {
    pravniStatus: new Set<string>(),
    djelatnost: new Set<string>(),
    osnivac: new Set<string>(),
  }
}

const hrCollator = new Intl.Collator('hr', { sensitivity: 'base' })

function normalizedOib(value: string): string {
  return value.replace(/\s/g, '')
}

export function classificationValue(value: string | null | undefined): string {
  const normalized = value?.trim()
  return normalized || NEKATEGORIZIRANO
}

export function classifyInstitution(
  institution: Institution,
  registryByOib: ReadonlyMap<string, RegistryClassificationEntry>,
): InstitutionClassification {
  const oib = normalizedOib(institution.oib ?? '')
  const registryEntry = oib ? registryByOib.get(oib) : undefined

  return {
    pravniStatus: classificationValue(registryEntry?.pravniStatus),
    djelatnost: classificationValue(registryEntry?.djelatnost),
    osnivac: classificationValue(registryEntry?.osnivac),
    registryMatched: Boolean(registryEntry),
  }
}

export function buildInstitutionClassificationMap(
  institutions: readonly Institution[],
  registryByOib: ReadonlyMap<string, RegistryClassificationEntry>,
): InstitutionClassificationMap {
  return Object.fromEntries(
    institutions
      .filter((institution): institution is Institution & { id: string } => Boolean(institution.id))
      .map(institution => [institution.id, classifyInstitution(institution, registryByOib)]),
  )
}

export function fallbackClassification(): InstitutionClassification {
  return {
    pravniStatus: NEKATEGORIZIRANO,
    djelatnost: NEKATEGORIZIRANO,
    osnivac: NEKATEGORIZIRANO,
    registryMatched: false,
  }
}

export function matchesClassificationFilters(
  classification: InstitutionClassification,
  filters: ClassificationFilterState,
): boolean {
  return (filters.pravniStatus.size === 0 || filters.pravniStatus.has(classification.pravniStatus))
    && (filters.djelatnost.size === 0 || filters.djelatnost.has(classification.djelatnost))
    && (filters.osnivac.size === 0 || filters.osnivac.has(classification.osnivac))
}

export function filterReportEntries(
  entries: readonly FinancialEntry[],
  filters: ReportFilterState,
): FinancialEntry[] {
  return entries.filter(entry => {
    if (filters.year !== 'all' && entry.year !== filters.year) return false
    if (!filters.categories.has(entry.categoryGroup)) return false
    if (filters.institutionId && entry.institutionId !== filters.institutionId) return false
    if (filters.valueType !== 'oba' && entry.valueType !== filters.valueType) return false

    const classification = filters.classifications[entry.institutionId] ?? fallbackClassification()
    return matchesClassificationFilters(classification, filters.classificationFilters)
  })
}

function sortedValues(values: Iterable<string>, preferredOrder: readonly string[] = []): string[] {
  const uniqueValues = new Set(Array.from(values, classificationValue))
  const ordered = preferredOrder.filter(value => uniqueValues.delete(value))
  const remaining = [...uniqueValues]
    .filter(value => value !== NEKATEGORIZIRANO)
    .sort(hrCollator.compare)

  if (uniqueValues.has(NEKATEGORIZIRANO)) remaining.push(NEKATEGORIZIRANO)
  return [...ordered, ...remaining]
}

export function buildClassificationOptions(
  classifications: InstitutionClassificationMap,
  officialOptions: Partial<Record<ClassificationDimension, readonly string[]>> = {},
  preferredPravniStatusOrder: readonly string[] = [],
): ClassificationOptions {
  const values = Object.values(classifications)
  return {
    pravniStatus: sortedValues(
      [...(officialOptions.pravniStatus ?? []), ...values.map(value => value.pravniStatus)],
      preferredPravniStatusOrder,
    ),
    djelatnost: sortedValues([...(officialOptions.djelatnost ?? []), ...values.map(value => value.djelatnost)]),
    osnivac: sortedValues([...(officialOptions.osnivac ?? []), ...values.map(value => value.osnivac)]),
  }
}

export function selectedClassificationFilterCount(filters: ClassificationFilterState): number {
  return filters.pravniStatus.size + filters.djelatnost.size + filters.osnivac.size
}

export function serializeClassificationFilters(filters: ClassificationFilterState): {
  pravniStatusi?: string[]
  djelatnosti?: string[]
  osnivaci?: string[]
} {
  return {
    pravniStatusi: filters.pravniStatus.size > 0 ? [...filters.pravniStatus] : undefined,
    djelatnosti: filters.djelatnost.size > 0 ? [...filters.djelatnost] : undefined,
    osnivaci: filters.osnivac.size > 0 ? [...filters.osnivac] : undefined,
  }
}

export function pickInstitutionClassifications(
  classifications: InstitutionClassificationMap,
  institutionIds: ReadonlySet<string>,
): InstitutionClassificationMap {
  return Object.fromEntries(
    Object.entries(classifications).filter(([institutionId]) => institutionIds.has(institutionId)),
  )
}
