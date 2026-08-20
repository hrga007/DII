import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { getProvider } from '../providers'
import { CATEGORIES, sumByCategoryYear, sumByYear, yoyChange, topInstitutions, compareInstitutions } from '../utils/analytics'
import type { CategoryGroup } from '../models/financialEntry'
import { LineChart } from '../components/LineChart'
import { YoYBadge } from '../components/YoYBadge'
import { RegistryClassificationFilters, RegistryClassificationMeta } from '../components/RegistryClassificationFilters'
import {
  buildClassificationOptions,
  buildInstitutionClassificationMap,
  createEmptyClassificationFilters,
  fallbackClassification,
  matchesClassificationFilters,
  selectedClassificationFilterCount,
  type ClassificationDimension,
  type ClassificationFilterState,
  type InstitutionClassificationMap,
} from '../utils/reportFilters'
import { getRegistry, PRAVNI_STATUSI } from '../utils/registryLoader'

const CAT_LABELS: Record<CategoryGroup, string> = {
  CAPEX: 'CAPEX',
  LICENCE: 'Licence',
  ODRZAVANJE: 'Održavanje',
  OPEX: 'OPEX',
  CLOUD: 'Cloud',
}

const CAT_COLORS: Record<CategoryGroup, string> = {
  CAPEX:      '#2563eb',  // blue
  LICENCE:    '#7c3aed',  // purple
  ODRZAVANJE: '#16a34a',  // green
  OPEX:       '#ea580c',  // orange
  CLOUD:      '#0891b2',  // cyan
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return `${v}`
}

function fmtFull(v: number): string {
  return v === 0 ? '—' : v.toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

type Tab = 'trendovi' | 'top' | 'usporedba'

export function TrendsPage() {
  usePageTitle('Trendovi')
  const [tab, setTab] = useState<Tab>('trendovi')
  const [valueType, setValueType] = useState<'realizirano' | 'planirano' | 'oba'>('realizirano')
  const [classificationFilters, setClassificationFilters] = useState<ClassificationFilterState>(
    () => createEmptyClassificationFilters(),
  )

  const { data: entries = [], isLoading: el } = useQuery({
    queryKey: ['allFinancialEntries'],
    queryFn: () => getProvider().getAllFinancialEntries(),
  })
  const { data: institutions = [], isLoading: il } = useQuery({
    queryKey: ['institutions'],
    queryFn: () => getProvider().getInstitutions(),
  })
  const {
    data: registry,
    isLoading: rl,
    isError: registryError,
  } = useQuery({
    queryKey: ['registry'],
    queryFn: getRegistry,
    staleTime: Infinity,
  })
  const loading = el || il || rl

  const classifications = useMemo(
    () => buildInstitutionClassificationMap(institutions, registry?.byOib ?? new Map()),
    [institutions, registry],
  )
  const classificationOptions = useMemo(
    () => buildClassificationOptions(
      classifications,
      {
        pravniStatus: registry?.pravniStatusi ?? [],
        djelatnost: registry?.djelatnosti ?? [],
        osnivac: registry?.osnivaci ?? [],
      },
      PRAVNI_STATUSI,
    ),
    [classifications, registry],
  )
  const scopedInstitutions = useMemo(
    () => registry
      ? institutions.filter(institution => institution.id && matchesClassificationFilters(
        classifications[institution.id] ?? fallbackClassification(),
        classificationFilters,
      ))
      : institutions,
    [classificationFilters, classifications, institutions, registry],
  )
  const scopedEntries = useMemo(
    () => registry
      ? entries.filter(entry => matchesClassificationFilters(
        classifications[entry.institutionId] ?? fallbackClassification(),
        classificationFilters,
      ))
      : entries,
    [classificationFilters, classifications, entries, registry],
  )
  const selectedClassificationCount = selectedClassificationFilterCount(classificationFilters)

  function updateClassificationFilter(dimension: ClassificationDimension, values: Set<string>) {
    setClassificationFilters(current => ({ ...current, [dimension]: values }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-800 mb-5">Trendovi</h1>
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📈</p>
          <p className="font-medium">Nema podataka za analizu trendova</p>
          <p className="text-sm mt-1">Uvezi barem jednu Excel datoteku da bi vidjeli trendove kroz godine.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Trendovi i usporedbe</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Kretanje IT ulaganja kroz godine, rang-liste i usporedba institucija
          </p>
        </div>
        {/* Value type pills */}
        <div className="flex gap-1.5 self-start sm:self-auto">
          {(['oba', 'realizirano', 'planirano'] as const).map(vt => (
            <button
              key={vt}
              onClick={() => setValueType(vt)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                valueType === vt
                  ? vt === 'realizirano' ? 'bg-green-600 text-white' : vt === 'planirano' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {vt === 'oba' ? 'Sve' : vt.charAt(0).toUpperCase() + vt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="trends-classification-title">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="trends-classification-title" className="text-sm font-semibold text-gray-800">
              Službena klasifikacija tijela javne vlasti
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Zajednički opseg za trendove, rang-listu i usporedbu institucija.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {scopedInstitutions.length} institucija · {scopedEntries.length} unosa
            </span>
            {selectedClassificationCount > 0 && (
              <button
                type="button"
                onClick={() => setClassificationFilters(createEmptyClassificationFilters())}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                Poništi sve ({selectedClassificationCount})
              </button>
            )}
          </div>
        </div>
        {registryError ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Službeni registar trenutačno nije dostupan. Analitika ostaje nefiltrirana, a klasifikacijski filtri su privremeno onemogućeni.
          </div>
        ) : (
          <RegistryClassificationFilters
            options={classificationOptions}
            selected={classificationFilters}
            onChange={updateClassificationFilter}
          />
        )}
      </section>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {([
          { key: 'trendovi',  label: 'Trendovi kroz godine' },
          { key: 'top',       label: 'Top 10 institucija' },
          { key: 'usporedba', label: 'Usporedba dvije institucije' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'trendovi'  && <TrendsTab  entries={scopedEntries} valueType={valueType} />}
      {tab === 'top'       && <TopTab     entries={scopedEntries} institutions={scopedInstitutions} classifications={classifications} valueType={valueType} />}
      {tab === 'usporedba' && <CompareTab entries={scopedEntries} institutions={scopedInstitutions} classifications={classifications} valueType={valueType} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tab: Trendovi kroz godine
// ────────────────────────────────────────────────────────────────────
function TrendsTab({ entries, valueType }: { entries: Awaited<ReturnType<ReturnType<typeof getProvider>['getAllFinancialEntries']>>; valueType: 'realizirano' | 'planirano' | 'oba' }) {
  const byCatYear = useMemo(() => sumByCategoryYear(entries, valueType), [entries, valueType])
  const yearTotals = useMemo(() => sumByYear(entries, valueType), [entries, valueType])

  const allYears = useMemo(() => {
    const ys = new Set<number>()
    byCatYear.forEach(m => m.forEach((_, y) => ys.add(y)))
    return [...ys].sort()
  }, [byCatYear])

  const series = CATEGORIES.map(cat => ({
    label: CAT_LABELS[cat],
    color: CAT_COLORS[cat],
    points: allYears.map(y => ({ x: y, y: byCatYear.get(cat)?.get(y) ?? 0 })),
  })).filter(s => s.points.some(p => p.y > 0))

  const totalSeries = [{
    label: 'Ukupno',
    color: '#0f172a',
    points: allYears.map(y => ({ x: y, y: yearTotals.get(y) ?? 0 })),
  }]

  return (
    <div className="space-y-5">
      {/* Total trend */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Ukupno ulaganja kroz godine</h2>
          <span className="text-xs text-gray-400">{valueType === 'oba' ? 'sve vrijednosti' : valueType}</span>
        </div>
        <LineChart series={totalSeries} xLabels={allYears} yLabel="EUR" fmt={fmt} />

        {/* YoY tablica */}
        {allYears.length > 1 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {allYears.map((y, i) => {
              const curr = yearTotals.get(y) ?? 0
              const prev = i > 0 ? (yearTotals.get(allYears[i - 1]) ?? 0) : 0
              const pct = i > 0 ? yoyChange(curr, prev) : null
              return (
                <div key={y} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">{y}</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{fmtFull(curr)}</p>
                  {pct !== null && (
                    <div className="mt-1">
                      <YoYBadge pct={pct} size="sm" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Po kategorijama */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Po kategorijama kroz godine</h2>
        <LineChart series={series} xLabels={allYears} yLabel="EUR" fmt={fmt} />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tab: Top 10 institucija
// ────────────────────────────────────────────────────────────────────
function TopTab({
  entries, institutions, classifications, valueType,
}: {
  entries: Awaited<ReturnType<ReturnType<typeof getProvider>['getAllFinancialEntries']>>
  institutions: Awaited<ReturnType<ReturnType<typeof getProvider>['getInstitutions']>>
  classifications: InstitutionClassificationMap
  valueType: 'realizirano' | 'planirano' | 'oba'
}) {
  const availableYears = useMemo(() => [...new Set(entries.map(e => e.year))].sort((a, b) => b - a), [entries])
  const [year, setYear] = useState<number | 'all'>(availableYears[0] ?? 'all')
  const [category, setCategory] = useState<CategoryGroup | 'all'>('all')
  const effectiveYear = year === 'all' || availableYears.includes(year) ? year : (availableYears[0] ?? 'all')

  const top = useMemo(
    () => topInstitutions(entries, institutions, { year: effectiveYear, category, valueType, limit: 10 }),
    [entries, institutions, effectiveYear, category, valueType],
  )

  const maxTotal = top[0]?.total ?? 1

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mr-auto">Top 10 institucija</h2>
        <select
          value={effectiveYear}
          onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Sve godine</option>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryGroup | 'all')}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Sve kategorije</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
        </select>
      </div>

      {top.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nema podataka za odabrane filtere</p>
      ) : (
        <div className="space-y-2">
          {top.map((row, i) => {
            const pct = (row.total / maxTotal) * 100
            return (
              <Link
                key={row.institution.id}
                to={`/institucije/${row.institution.id}`}
                className="block group"
              >
                <div className="flex items-center gap-3 py-2 px-1">
                  <span className="w-6 text-right text-xs text-gray-400 font-semibold tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1 gap-2">
                      <p className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-700 transition-colors">
                        {row.institution.name}
                      </p>
                      <p className="text-sm font-bold text-gray-800 tabular-nums shrink-0">{fmtFull(row.total)}</p>
                    </div>
                    <RegistryClassificationMeta
                      classification={classifications[row.institution.id ?? ''] ?? fallbackClassification()}
                      className="mb-1.5"
                    />
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tab: Usporedba dvije institucije
// ────────────────────────────────────────────────────────────────────
function CompareTab({
  entries, institutions, classifications, valueType,
}: {
  entries: Awaited<ReturnType<ReturnType<typeof getProvider>['getAllFinancialEntries']>>
  institutions: Awaited<ReturnType<ReturnType<typeof getProvider>['getInstitutions']>>
  classifications: InstitutionClassificationMap
  valueType: 'realizirano' | 'planirano' | 'oba'
}) {
  const availableYears = useMemo(() => [...new Set(entries.map(e => e.year))].sort((a, b) => b - a), [entries])
  const [year, setYear] = useState<number | 'all'>(availableYears[0] ?? 'all')
  const [aId, setAId] = useState<string>('')
  const [bId, setBId] = useState<string>('')
  const effectiveYear = year === 'all' || availableYears.includes(year) ? year : (availableYears[0] ?? 'all')

  const a = institutions.find(i => i.id === aId)
  const b = institutions.find(i => i.id === bId)

  const rows = useMemo(
    () => (aId && bId ? compareInstitutions(entries, aId, bId, { year: effectiveYear, valueType }) : []),
    [entries, aId, bId, effectiveYear, valueType],
  )
  const totalA = rows.reduce((s, r) => s + r.a, 0)
  const totalB = rows.reduce((s, r) => s + r.b, 0)
  const totalDiff = totalA - totalB
  const totalPct = yoyChange(totalA, totalB)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Institucija A</label>
          <select
            value={aId}
            onChange={(e) => setAId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Odaberi —</option>
            {institutions.map(i => (
              <option key={i.id} value={i.id}>
                {i.name} — {(classifications[i.id ?? ''] ?? fallbackClassification()).pravniStatus}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Institucija B</label>
          <select
            value={bId}
            onChange={(e) => setBId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Odaberi —</option>
            {institutions.map(i => (
              <option key={i.id} value={i.id}>
                {i.name} — {(classifications[i.id ?? ''] ?? fallbackClassification()).pravniStatus}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Godina</label>
          <select
            value={effectiveYear}
            onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Sve godine</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {!a || !b ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          Odaberi dvije institucije za usporedbu
        </div>
      ) : aId === bId ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          Odaberi dvije <strong>različite</strong> institucije
        </div>
      ) : (
        <div>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
              <p className="text-sm font-semibold text-gray-800">A · {a.name}</p>
              <RegistryClassificationMeta classification={classifications[aId] ?? fallbackClassification()} />
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
              <p className="text-sm font-semibold text-gray-800">B · {b.name}</p>
              <RegistryClassificationMeta classification={classifications[bId] ?? fallbackClassification()} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Kategorija</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{a.name}</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{b.name}</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Razlika</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">% A vs B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.category} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-medium">{r.category}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtFull(r.a)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtFull(r.b)}</td>
                  <td className={`px-4 py-2 text-right font-mono ${r.diff > 0 ? 'text-emerald-600' : r.diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {r.diff > 0 ? '+' : ''}{fmtFull(r.diff)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <YoYBadge pct={r.diffPct} size="sm" />
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-2 text-gray-700">UKUPNO</td>
                <td className="px-4 py-2 text-right font-mono">{fmtFull(totalA)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmtFull(totalB)}</td>
                <td className={`px-4 py-2 text-right font-mono ${totalDiff > 0 ? 'text-emerald-700' : totalDiff < 0 ? 'text-red-700' : 'text-gray-400'}`}>
                  {totalDiff > 0 ? '+' : ''}{fmtFull(totalDiff)}
                </td>
                <td className="px-4 py-2 text-right"><YoYBadge pct={totalPct} size="sm" /></td>
              </tr>
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
