import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '../hooks/usePageTitle'
import * as XLSX from 'xlsx'
import { getProvider } from '../providers'
import type { FinancialEntry, CategoryGroup } from '../models/financialEntry'
import { ShareModal } from '../components/ShareModal'
import type { ShareSnapshot } from '../models/shareLink'
import { RegistryClassificationFilters, RegistryClassificationMeta } from '../components/RegistryClassificationFilters'
import { getRegistry, PRAVNI_STATUSI, REGISTRY_SOURCE_URL } from '../utils/registryLoader'
import {
  buildClassificationOptions,
  buildInstitutionClassificationMap,
  createEmptyClassificationFilters,
  fallbackClassification,
  filterReportEntries,
  matchesClassificationFilters,
  pickInstitutionClassifications,
  selectedClassificationFilterCount,
  serializeClassificationFilters,
  type ClassificationDimension,
  type ClassificationFilterState,
  type RegistryClassificationEntry,
} from '../utils/reportFilters'

const CATEGORIES: CategoryGroup[] = ['CAPEX', 'LICENCE', 'ODRZAVANJE', 'OPEX', 'CLOUD']
const CAT_LABELS: Record<CategoryGroup, string> = {
  CAPEX: 'CAPEX',
  LICENCE: 'Licence',
  ODRZAVANJE: 'Održavanje',
  OPEX: 'OPEX',
  CLOUD: 'Cloud',
}
const ALL_YEARS = [2024, 2025, 2026, 2027, 2028]
const EMPTY_REGISTRY = new Map<string, RegistryClassificationEntry>()

type SortCol = CategoryGroup | 'Ukupno' | 'name'
type SortDir = 'asc' | 'desc'

function fmt(v: number) {
  return v === 0 ? '—' : v.toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function ReportsPage() {
  usePageTitle('Izvještaji')
  const navigate = useNavigate()
  // Filters
  const [year, setYear] = useState<number | 'all'>(new Date().getFullYear())
  const [selectedCats, setSelectedCats] = useState<Set<CategoryGroup>>(new Set(CATEGORIES))
  const [instSearch, setInstSearch] = useState('')
  const [instFilter, setInstFilter] = useState<string | null>(null) // institution id or null=all
  const [valueType, setValueType] = useState<'realizirano' | 'planirano' | 'oba'>('realizirano')
  const [classificationFilters, setClassificationFilters] = useState<ClassificationFilterState>(
    createEmptyClassificationFilters,
  )

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>('Ukupno')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Share
  const [shareOpen, setShareOpen] = useState(false)

  const { data: allEntries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['allFinancialEntries'],
    queryFn: () => getProvider().getAllFinancialEntries(),
  })
  const { data: institutions = [], isLoading: instLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: () => getProvider().getInstitutions(),
  })
  const {
    data: registry,
    isLoading: registryLoading,
    isError: registryError,
    isFetching: registryFetching,
    refetch: refetchRegistry,
  } = useQuery({
    queryKey: ['registry'],
    queryFn: getRegistry,
    staleTime: Infinity,
  })
  const loading = entriesLoading || instLoading || registryLoading

  // Default year to the most common year in data
  useEffect(() => {
    if (allEntries.length === 0) return
    const yearCounts: Record<number, number> = {}
    allEntries.forEach((e: FinancialEntry) => { yearCounts[e.year] = (yearCounts[e.year] ?? 0) + 1 })
    const topYear = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (topYear) setYear(Number(topYear))
  }, [allEntries])

  // Available years from data
  const availableYears = useMemo(() => {
    const ys = new Set(allEntries.map((e) => e.year))
    return ALL_YEARS.filter((y) => ys.has(y))
  }, [allEntries])

  const institutionClassifications = useMemo(
    () => buildInstitutionClassificationMap(institutions, registry?.byOib ?? EMPTY_REGISTRY),
    [institutions, registry],
  )

  const classificationOptions = useMemo(
    () => buildClassificationOptions(
      institutionClassifications,
      {
        pravniStatus: registry?.pravniStatusi,
        djelatnost: registry?.djelatnosti,
        osnivac: registry?.osnivaci,
      },
      PRAVNI_STATUSI,
    ),
    [institutionClassifications, registry],
  )

  const classificationFilterCount = selectedClassificationFilterCount(classificationFilters)
  const uncategorizedInstitutionCount = useMemo(
    () => Object.values(institutionClassifications).filter(value => !value.registryMatched).length,
    [institutionClassifications],
  )

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return filterReportEntries(allEntries, {
      year,
      categories: selectedCats,
      valueType,
      institutionId: instFilter,
      classifications: institutionClassifications,
      classificationFilters,
    })
  }, [allEntries, year, selectedCats, instFilter, valueType, institutionClassifications, classificationFilters])

  // Institutions to show (those with data after filters)
  const instIds = useMemo(
    () => new Set(filteredEntries.map((e) => e.institutionId)),
    [filteredEntries]
  )
  const instRows = useMemo(
    () => institutions.filter((i) => instIds.has(i.id!)),
    [institutions, instIds]
  )

  // Pivot data per institution
  const pivot = useMemo(() => {
    return instRows.map((inst) => {
      const instEntries = filteredEntries.filter((e) => e.institutionId === inst.id)
      const catTotals: Record<CategoryGroup, number> = {} as Record<CategoryGroup, number>
      CATEGORIES.forEach((c) => {
        catTotals[c] = instEntries.filter((e) => e.categoryGroup === c).reduce((s, e) => s + (e.amount ?? 0), 0)
      })
      const total = Object.values(catTotals).reduce((s, v) => s + v, 0)
      return { inst, catTotals, total }
    })
  }, [instRows, filteredEntries])

  // Sort
  const sortedPivot = useMemo(() => {
    return [...pivot].sort((a, b) => {
      let av: number | string, bv: number | string
      if (sortCol === 'name') { av = a.inst.name; bv = b.inst.name }
      else if (sortCol === 'Ukupno') { av = a.total; bv = b.total }
      else { av = a.catTotals[sortCol]; bv = b.catTotals[sortCol] }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string, 'hr') : (bv as string).localeCompare(av, 'hr')
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [pivot, sortCol, sortDir])

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('desc') }
  }

  function toggleCat(cat: CategoryGroup) {
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) { if (next.size > 1) next.delete(cat) } else next.add(cat)
      return next
    })
  }

  function updateClassificationFilter(dimension: ClassificationDimension, values: Set<string>) {
    setClassificationFilters(previous => ({ ...previous, [dimension]: values }))
  }

  function clearClassificationFilters() {
    setClassificationFilters(createEmptyClassificationFilters())
  }

  // Institutution autocomplete filtered list
  const instSuggestions = useMemo(
    () => institutions
      .filter(institution => {
        if (!institution.name.toLocaleLowerCase('hr').includes(instSearch.toLocaleLowerCase('hr'))) return false
        if (!institution.id) return false
        return matchesClassificationFilters(
          institutionClassifications[institution.id] ?? fallbackClassification(),
          classificationFilters,
        )
      })
      .slice(0, 8),
    [institutions, instSearch, institutionClassifications, classificationFilters]
  )

  const visibleCats = CATEGORIES.filter((category) => selectedCats.has(category))

  // Column totals
  const colTotals = useMemo(() => {
    const totals: Record<CategoryGroup, number> = {} as Record<CategoryGroup, number>
    CATEGORIES.forEach((c) => { totals[c] = sortedPivot.reduce((s, r) => s + r.catTotals[c], 0) })
    return { ...totals, Ukupno: sortedPivot.reduce((s, r) => s + r.total, 0) }
  }, [sortedPivot])

  // Export Excel
  function exportExcel() {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Pregled
    const pregledData: (string | number)[][] = [
      ['Institucija', 'Vrsta tijela', 'Djelatnost', 'Osnivač', ...visibleCats.map((c) => CAT_LABELS[c]), 'Ukupno'],
      ...sortedPivot.map((r) => [
        r.inst.name,
        institutionClassifications[r.inst.id!]?.pravniStatus ?? 'Nekategorizirano',
        institutionClassifications[r.inst.id!]?.djelatnost ?? 'Nekategorizirano',
        institutionClassifications[r.inst.id!]?.osnivac ?? 'Nekategorizirano',
        ...visibleCats.map((c) => r.catTotals[c]),
        r.total,
      ]),
      ['UKUPNO', '', '', '', ...visibleCats.map((c) => colTotals[c]), colTotals['Ukupno']],
    ]
    const pregledSheet = XLSX.utils.aoa_to_sheet(pregledData)
    pregledSheet['!cols'] = [
      { wch: 44 }, { wch: 36 }, { wch: 30 }, { wch: 36 },
      ...visibleCats.map(() => ({ wch: 14 })), { wch: 16 },
    ]
    XLSX.utils.book_append_sheet(wb, pregledSheet, 'Pregled')

    // Sheet 2: Detalji
    const detaljiData: (string | number)[][] = [
      ['Institucija', 'Vrsta tijela', 'Djelatnost', 'Osnivač', 'Kategorija', 'Kategorija naziv', 'Godina', 'Tip vrijednosti', 'Iznos', 'Napomena'],
      ...filteredEntries.map((e) => {
        const inst = institutions.find((i) => i.id === e.institutionId)
        const classification = institutionClassifications[e.institutionId] ?? fallbackClassification()
        return [
          inst?.name ?? e.institutionId,
          classification.pravniStatus,
          classification.djelatnost,
          classification.osnivac,
          e.categoryGroup,
          e.categoryName,
          e.year,
          e.valueType,
          e.amount ?? 0,
          e.note,
        ]
      }),
    ]
    const detaljiSheet = XLSX.utils.aoa_to_sheet(detaljiData)
    detaljiSheet['!cols'] = [
      { wch: 44 }, { wch: 36 }, { wch: 30 }, { wch: 36 }, { wch: 14 },
      { wch: 32 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 42 },
    ]
    XLSX.utils.book_append_sheet(wb, detaljiSheet, 'Detalji')

    const serializedClassifications = serializeClassificationFilters(classificationFilters)
    const filterData: (string | number)[][] = [
      ['Filtar', 'Odabrano'],
      ['Godina', year === 'all' ? 'Sve godine' : year],
      ['Kategorije', visibleCats.map(category => CAT_LABELS[category]).join(', ')],
      ['Tip vrijednosti', valueType === 'oba' ? 'Sve' : valueType],
      ['Institucija', instFilter ? institutions.find(institution => institution.id === instFilter)?.name ?? instFilter : 'Sve institucije'],
      ['Vrsta tijela', serializedClassifications.pravniStatusi?.join(', ') ?? 'Sve vrste tijela'],
      ['Djelatnost', serializedClassifications.djelatnosti?.join(', ') ?? 'Sve djelatnosti'],
      ['Osnivač', serializedClassifications.osnivaci?.join(', ') ?? 'Svi osnivači'],
      ['Izvor klasifikacije', `Popis tijela javne vlasti — ${REGISTRY_SOURCE_URL}`],
      ['Najnovija izmjena u izvoru', registry?.registryUpdatedAt ?? 'Nije navedena'],
      ['Broj zapisa u korištenoj verziji registra', registry?.entries.length ?? 'Nije dostupno'],
    ]
    const filterSheet = XLSX.utils.aoa_to_sheet(filterData)
    filterSheet['!cols'] = [{ wch: 24 }, { wch: 100 }]
    XLSX.utils.book_append_sheet(wb, filterSheet, 'Filteri')

    const yearLabel = year === 'all' ? 'sve' : year
    XLSX.writeFile(wb, `DII_Izvjestaj_${yearLabel}.xlsx`)
  }

  // Export PDF via browser print
  function exportPdf() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (registryError) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-gray-800">Službena klasifikacija trenutačno nije dostupna</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
          Izvještaj nije prikazan kako institucije ne bi bile pogrešno označene kao nekategorizirane.
        </p>
        <button
          type="button"
          onClick={() => { void refetchRegistry() }}
          disabled={registryFetching}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {registryFetching ? 'Pokušavam…' : 'Pokušaj ponovno'}
        </button>
      </div>
    )
  }

  const renderSortIcon = (col: SortCol) =>
    sortCol === col ? (
      <span className="ml-1 text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>
    ) : (
      <span className="ml-1 text-xs text-gray-300">⇅</span>
    )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 print:hidden">
        <h1 className="text-xl font-bold text-gray-800">Izvještaji</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <span>🔗</span> Podijeli
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <span>📊</span> Export Excel
          </button>
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <span>📄</span> Export PDF
          </button>
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        type="report"
        defaultTitle={`Izvješće ${year === 'all' ? '' : year}`.trim()}
        buildSnapshot={(): ShareSnapshot => {
          const usedInstIds = new Set(filteredEntries.map(e => e.institutionId))
          const filters: ShareSnapshot['filters'] = {
            year,
            categories: visibleCats,
            valueType,
            ...serializeClassificationFilters(classificationFilters),
          }
          if (instFilter) filters.institutionId = instFilter
          return {
            filters,
            institutions: institutions.filter(i => i.id && usedInstIds.has(i.id)),
            entries: filteredEntries,
            institutionClassifications: pickInstitutionClassifications(institutionClassifications, usedInstIds),
            registrySource: registry ? {
              url: REGISTRY_SOURCE_URL,
              updatedAt: registry.registryUpdatedAt,
              recordCount: registry.entries.length,
            } : undefined,
          }
        }}
      />

      {/* Filter panel */}
      <section aria-label="Filteri izvještaja" className="bg-white rounded-2xl border border-gray-200 p-4 mb-5 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Godina */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Godina</p>
            <div className="flex flex-wrap gap-1.5">
              <label className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="year"
                  checked={year === 'all'}
                  onChange={() => setYear('all')}
                  className="accent-blue-600"
                />
                Sve
              </label>
              {availableYears.map((y) => (
                <label key={y} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="year"
                    checked={year === y}
                    onChange={() => setYear(y)}
                    className="accent-blue-600"
                  />
                  {y}
                </label>
              ))}
            </div>
          </div>

          {/* Kategorija */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Kategorije</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  aria-pressed={selectedCats.has(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                    selectedCats.has(cat)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {CAT_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Tip vrijednosti */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Tip vrijednosti</p>
            <div className="flex flex-wrap gap-1.5">
              {(['realizirano', 'planirano', 'oba'] as const).map((vt) => (
                <button
                  type="button"
                  key={vt}
                  onClick={() => setValueType(vt)}
                  aria-pressed={valueType === vt}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                    valueType === vt
                      ? vt === 'realizirano' ? 'bg-green-600 text-white border-green-600'
                        : vt === 'planirano' ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {vt === 'oba' ? 'Sve' : vt.charAt(0).toUpperCase() + vt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Institucija autocomplete */}
          <div className="relative">
            <label htmlFor="report-institution-filter" className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Institucija</label>
            <input
              id="report-institution-filter"
              type="text"
              value={instFilter ? (institutions.find((i) => i.id === instFilter)?.name ?? instSearch) : instSearch}
              onChange={(e) => { setInstSearch(e.target.value); setInstFilter(null) }}
              onFocus={(event) => { if (instFilter) event.currentTarget.select() }}
              placeholder="Sve institucije..."
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={!instFilter && Boolean(instSearch) && instSuggestions.length > 0}
              aria-controls="report-institution-suggestions"
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!instFilter && instSearch && instSuggestions.length > 0 && (
              <div id="report-institution-suggestions" role="listbox" className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {instSuggestions.map((i) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    key={i.id}
                    onClick={() => { setInstFilter(i.id!); setInstSearch(i.name) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {i.name}
                  </button>
                ))}
              </div>
            )}
            {instFilter && (
              <button
                type="button"
                aria-label="Ukloni filtar institucije"
                onClick={() => { setInstFilter(null); setInstSearch('') }}
                className="absolute right-2 top-8 text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Klasifikacija institucija</h2>
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                  Službeni izvor
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                <a
                  href={REGISTRY_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  Popis tijela javne vlasti
                </a>
                {' · povezivanje po OIB-u'}
                {uncategorizedInstitutionCount > 0 && ` · ${uncategorizedInstitutionCount} bez službenog uparivanja`}
              </p>
            </div>
            {classificationFilterCount > 0 && (
              <button
                type="button"
                onClick={clearClassificationFilters}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-50 hover:text-blue-900"
              >
                Poništi klasifikacijske filtre
              </button>
            )}
          </div>
          <RegistryClassificationFilters
            options={classificationOptions}
            selected={classificationFilters}
            onChange={updateClassificationFilter}
          />
        </div>
      </section>

      {/* Results summary */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-3 print:hidden">
        <span>{sortedPivot.length} institucija</span>
        <span>·</span>
        <span>{filteredEntries.length} unosa</span>
        {year !== 'all' && <><span>·</span><span>Godina: {year}</span></>}
        {instFilter && <><span>·</span><span className="text-blue-600">{institutions.find(i => i.id === instFilter)?.name}</span></>}
        {classificationFilterCount > 0 && (
          <>
            <span>·</span>
            <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              {classificationFilterCount} klasifikacijskih odabira
            </span>
          </>
        )}
        <span className="ml-auto text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
          Prikazuju se podaci iz aktivnih batcheva
        </span>
      </div>

      {/* Print header (only visible in print) */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">DII IT Ulaganja — Izvještaj</h1>
        <p className="text-sm text-gray-500 mt-1">
          Godina: {year === 'all' ? 'Sve godine' : year} · Tip: {valueType} · Datum: {new Date().toLocaleDateString('hr-HR')}
        </p>
        {classificationFilters.pravniStatus.size > 0 && (
          <p className="mt-1 text-xs text-gray-500">Vrsta tijela: {[...classificationFilters.pravniStatus].join(', ')}</p>
        )}
        {classificationFilters.djelatnost.size > 0 && (
          <p className="mt-1 text-xs text-gray-500">Djelatnost: {[...classificationFilters.djelatnost].join(', ')}</p>
        )}
        {classificationFilters.osnivac.size > 0 && (
          <p className="mt-1 text-xs text-gray-500">Osnivač: {[...classificationFilters.osnivac].join(', ')}</p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Izvor klasifikacije: Popis tijela javne vlasti ({REGISTRY_SOURCE_URL})
          {' · najnovija izmjena u izvoru: '}{registry?.registryUpdatedAt ?? 'nije navedena'}
          {' · zapisa u korištenoj verziji: '}{registry?.entries.length.toLocaleString('hr-HR') ?? 'nije dostupno'}
        </p>
      </div>

      {/* Pivot table */}
      {sortedPivot.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p className="font-medium">Nema podataka za odabrane filtere</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                    <button className="flex items-center hover:text-blue-700 transition-colors" onClick={() => toggleSort('name')}>
                      Institucija {renderSortIcon('name')}
                    </button>
                  </th>
                  {visibleCats.map((cat) => (
                    <th key={cat} className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                      <button className="flex items-center justify-end hover:text-blue-700 transition-colors" onClick={() => toggleSort(cat)}>
                        {CAT_LABELS[cat]} {renderSortIcon(cat)}
                      </button>
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                    <button className="flex items-center justify-end hover:text-blue-700 transition-colors" onClick={() => toggleSort('Ukupno')}>
                      Ukupno {renderSortIcon('Ukupno')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedPivot.map(({ inst, catTotals, total }) => (
                  <tr
                    key={inst.id}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/institucije/${inst.id}`)}
                  >
                    <td className="min-w-80 px-4 py-3 font-medium text-blue-700 hover:underline">
                      <span>{inst.name}</span>
                      <RegistryClassificationMeta
                        classification={institutionClassifications[inst.id!] ?? fallbackClassification()}
                        className="no-underline"
                      />
                    </td>
                    {visibleCats.map((cat) => (
                      <td key={cat} className={`px-3 py-3 text-right whitespace-nowrap ${catTotals[cat] > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                        {fmt(catTotals[cat])}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {fmt(total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Column totals */}
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                  <td className="px-4 py-3 text-gray-700">UKUPNO</td>
                  {visibleCats.map((cat) => (
                    <td key={cat} className="px-3 py-3 text-right text-gray-800 whitespace-nowrap">
                      {fmt(colTotals[cat])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
                    {fmt(colTotals['Ukupno'])}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          table, table * { visibility: visible; }
          .bg-white { background: white !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  )
}
