import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '../hooks/usePageTitle'
import * as XLSX from 'xlsx'
import { getProvider } from '../providers'
import type { FinancialEntry, CategoryGroup } from '../models/financialEntry'
import { ShareModal } from '../components/ShareModal'
import type { ShareSnapshot } from '../models/shareLink'

const CATEGORIES: CategoryGroup[] = ['CAPEX', 'LICENCE', 'ODRZAVANJE', 'OPEX', 'CLOUD']
const CAT_LABELS: Record<CategoryGroup, string> = {
  CAPEX: 'CAPEX',
  LICENCE: 'Licence',
  ODRZAVANJE: 'Održavanje',
  OPEX: 'OPEX',
  CLOUD: 'Cloud',
}
const ALL_YEARS = [2024, 2025, 2026, 2027, 2028]

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
  const loading = entriesLoading || instLoading

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

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      if (year !== 'all' && e.year !== year) return false
      if (!selectedCats.has(e.categoryGroup)) return false
      if (instFilter && e.institutionId !== instFilter) return false
      if (valueType !== 'oba' && e.valueType !== valueType) return false
      return true
    })
  }, [allEntries, year, selectedCats, instFilter, valueType])

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

  // Institutution autocomplete filtered list
  const instSuggestions = useMemo(
    () => institutions.filter((i) => i.name.toLowerCase().includes(instSearch.toLowerCase())).slice(0, 8),
    [institutions, instSearch]
  )

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
      ['Institucija', ...CATEGORIES.map((c) => CAT_LABELS[c]), 'Ukupno'],
      ...sortedPivot.map((r) => [
        r.inst.name,
        ...CATEGORIES.map((c) => r.catTotals[c]),
        r.total,
      ]),
      ['UKUPNO', ...CATEGORIES.map((c) => colTotals[c]), colTotals['Ukupno']],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pregledData), 'Pregled')

    // Sheet 2: Detalji
    const detaljiData: (string | number)[][] = [
      ['Institucija', 'Kategorija', 'Kategorija naziv', 'Godina', 'Tip vrijednosti', 'Iznos', 'Napomena'],
      ...filteredEntries.map((e) => {
        const inst = institutions.find((i) => i.id === e.institutionId)
        return [
          inst?.name ?? e.institutionId,
          e.categoryGroup,
          e.categoryName,
          e.year,
          e.valueType,
          e.amount ?? 0,
          e.note,
        ]
      }),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detaljiData), 'Detalji')

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

  const SortIcon = ({ col }: { col: SortCol }) =>
    sortCol === col ? (
      <span className="ml-1 text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>
    ) : (
      <span className="ml-1 text-xs text-gray-300">⇅</span>
    )

  const visibleCats = CATEGORIES.filter((c) => selectedCats.has(c))

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
            categories: [...selectedCats],
            valueType,
          }
          if (instFilter) filters.institutionId = instFilter
          return {
            filters,
            institutions: institutions.filter(i => i.id && usedInstIds.has(i.id)),
            entries: filteredEntries,
          }
        }}
      />

      {/* Filter panel */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5 print:hidden">
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
                  key={cat}
                  onClick={() => toggleCat(cat)}
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
                  key={vt}
                  onClick={() => setValueType(vt)}
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
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Institucija</p>
            <input
              type="text"
              value={instFilter ? (institutions.find((i) => i.id === instFilter)?.name ?? instSearch) : instSearch}
              onChange={(e) => { setInstSearch(e.target.value); setInstFilter(null) }}
              onFocus={() => { if (instFilter) setInstSearch('') }}
              placeholder="Sve institucije..."
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!instFilter && instSearch && instSuggestions.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {instSuggestions.map((i) => (
                  <button
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
                onClick={() => { setInstFilter(null); setInstSearch('') }}
                className="absolute right-2 top-8 text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results summary */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-3 print:hidden">
        <span>{sortedPivot.length} institucija</span>
        <span>·</span>
        <span>{filteredEntries.length} unosa</span>
        {year !== 'all' && <><span>·</span><span>Godina: {year}</span></>}
        {instFilter && <><span>·</span><span className="text-blue-600">{institutions.find(i => i.id === instFilter)?.name}</span></>}
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
                      Institucija <SortIcon col="name" />
                    </button>
                  </th>
                  {visibleCats.map((cat) => (
                    <th key={cat} className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                      <button className="flex items-center justify-end hover:text-blue-700 transition-colors" onClick={() => toggleSort(cat)}>
                        {CAT_LABELS[cat]} <SortIcon col={cat} />
                      </button>
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                    <button className="flex items-center justify-end hover:text-blue-700 transition-colors" onClick={() => toggleSort('Ukupno')}>
                      Ukupno <SortIcon col="Ukupno" />
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
                    <td className="px-4 py-3 font-medium text-blue-700 hover:underline whitespace-nowrap">
                      {inst.name}
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
