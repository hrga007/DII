import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getInstitutions,
  getBatchesByInstitution,
  getFinancialEntriesByInstitution,
  getInstalledResourcesByInstitution,
  getImportIssuesByInstitution,
} from '../services/firestoreService'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { CategoryGroup } from '../models/financialEntry'
import { StatusBadge, ActiveBadge, SeverityBadge } from '../components/StatusBadge'

const CATEGORIES: CategoryGroup[] = ['CAPEX', 'LICENCE', 'ODRZAVANJE', 'OPEX', 'CLOUD']
const CAT_LABELS: Record<CategoryGroup, string> = {
  CAPEX: 'CAPEX',
  LICENCE: 'Licence',
  ODRZAVANJE: 'Održavanje',
  OPEX: 'OPEX',
  CLOUD: 'Cloud',
}
const YEARS = [2024, 2025, 2026, 2027, 2028]

type Tab = 'financije' | 'batches' | 'resursi' | 'greske'

// Simple SVG bar chart: realizirano (green) vs planirano (blue) per category
function BarChart({ entries }: { entries: FinancialEntry[] }) {
  const data = CATEGORIES.map((cat) => {
    const catEntries = entries.filter((e) => e.categoryGroup === cat)
    const realized = catEntries.filter((e) => e.valueType === 'realizirano').reduce((s, e) => s + (e.amount ?? 0), 0)
    const planned = catEntries.filter((e) => e.valueType === 'planirano').reduce((s, e) => s + (e.amount ?? 0), 0)
    return { cat, realized, planned }
  }).filter((d) => d.realized > 0 || d.planned > 0)

  if (data.length === 0) return null

  const maxVal = Math.max(...data.flatMap((d) => [d.realized, d.planned]), 1)
  const chartH = 140
  const barW = 20
  const gap = 6
  const groupW = barW * 2 + gap + 24
  const svgW = data.length * groupW + 20

  const fmt = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : `${v}`

  return (
    <div className="overflow-x-auto">
      <svg width={svgW} height={chartH + 40} className="block mx-auto">
        {data.map((d, i) => {
          const x = i * groupW + 10
          const rH = Math.max(2, (d.realized / maxVal) * chartH)
          const pH = Math.max(2, (d.planned / maxVal) * chartH)
          return (
            <g key={d.cat}>
              {/* Realized bar */}
              <rect x={x} y={chartH - rH} width={barW} height={rH} fill="#16a34a" rx={3} opacity={0.85} />
              {d.realized > 0 && (
                <text x={x + barW / 2} y={chartH - rH - 3} textAnchor="middle" fontSize={8} fill="#15803d">
                  {fmt(d.realized)}
                </text>
              )}
              {/* Planned bar */}
              <rect x={x + barW + gap} y={chartH - pH} width={barW} height={pH} fill="#2563eb" rx={3} opacity={0.75} />
              {d.planned > 0 && (
                <text x={x + barW + gap + barW / 2} y={chartH - pH - 3} textAnchor="middle" fontSize={8} fill="#1d4ed8">
                  {fmt(d.planned)}
                </text>
              )}
              {/* Category label */}
              <text x={x + barW + gap / 2} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#6b7280">
                {CAT_LABELS[d.cat]}
              </text>
            </g>
          )
        })}
        {/* Legend */}
        <g transform={`translate(10, ${chartH + 26})`}>
          <rect width={10} height={10} fill="#16a34a" rx={2} />
          <text x={14} y={9} fontSize={9} fill="#374151">Realizirano</text>
          <rect x={80} width={10} height={10} fill="#2563eb" rx={2} />
          <text x={94} y={9} fontSize={9} fill="#374151">Planirano</text>
        </g>
      </svg>
    </div>
  )
}

// Pivot: kategorija × godine, s color-coding realizirano/planirano
function FinancialPivot({ entries }: { entries: FinancialEntry[] }) {
  const [valueType, setValueType] = useState<'realizirano' | 'planirano' | 'oba'>('oba')

  const years = YEARS.filter((y) => entries.some((e) => e.year === y))
  if (years.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">Nema financijskih podataka</p>

  const getValue = (cat: CategoryGroup, year: number, vt: 'realizirano' | 'planirano') =>
    entries
      .filter((e) => e.categoryGroup === cat && e.year === year && e.valueType === vt)
      .reduce((s, e) => s + (e.amount ?? 0), 0)

  const fmt = (v: number) =>
    v === 0 ? '—' : v.toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div>
      {/* Toggle */}
      <div className="flex gap-2 mb-4">
        {(['oba', 'realizirano', 'planirano'] as const).map((vt) => (
          <button
            key={vt}
            onClick={() => setValueType(vt)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              valueType === vt
                ? vt === 'realizirano' ? 'bg-green-600 text-white' : vt === 'planirano' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {vt === 'oba' ? 'Sve' : vt.charAt(0).toUpperCase() + vt.slice(1)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Kategorija</th>
              {years.map((y) => (
                <th key={y} colSpan={valueType === 'oba' ? 2 : 1} className="text-center px-2 py-2 font-semibold text-gray-600">
                  {y}
                  {valueType === 'oba' && (
                    <div className="flex justify-center gap-2 text-xs font-normal mt-0.5">
                      <span className="text-green-700">Realiz.</span>
                      <span className="text-blue-700">Planirano</span>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {CATEGORIES.map((cat) => {
              const hasData = years.some(
                (y) => getValue(cat, y, 'realizirano') > 0 || getValue(cat, y, 'planirano') > 0
              )
              if (!hasData) return null
              return (
                <tr key={cat} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{CAT_LABELS[cat]}</td>
                  {years.map((y) => {
                    const r = getValue(cat, y, 'realizirano')
                    const p = getValue(cat, y, 'planirano')
                    if (valueType === 'realizirano') {
                      return (
                        <td key={y} className={`px-3 py-2 text-right whitespace-nowrap ${r > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                          {fmt(r)}
                        </td>
                      )
                    }
                    if (valueType === 'planirano') {
                      return (
                        <td key={y} className={`px-3 py-2 text-right whitespace-nowrap ${p > 0 ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
                          {fmt(p)}
                        </td>
                      )
                    }
                    return (
                      <>
                        <td key={`${y}-r`} className={`px-2 py-2 text-right whitespace-nowrap text-xs ${r > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                          {fmt(r)}
                        </td>
                        <td key={`${y}-p`} className={`px-2 py-2 text-right whitespace-nowrap text-xs border-r border-gray-100 ${p > 0 ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
                          {fmt(p)}
                        </td>
                      </>
                    )
                  })}
                </tr>
              )
            })}
            {/* Ukupno row */}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-3 py-2 text-gray-700">Ukupno</td>
              {years.map((y) => {
                const totalR = CATEGORIES.reduce((s, c) => s + getValue(c, y, 'realizirano'), 0)
                const totalP = CATEGORIES.reduce((s, c) => s + getValue(c, y, 'planirano'), 0)
                if (valueType === 'realizirano') {
                  return (
                    <td key={y} className="px-3 py-2 text-right text-green-800 whitespace-nowrap">{fmt(totalR)}</td>
                  )
                }
                if (valueType === 'planirano') {
                  return (
                    <td key={y} className="px-3 py-2 text-right text-blue-800 whitespace-nowrap">{fmt(totalP)}</td>
                  )
                }
                return (
                  <>
                    <td key={`${y}-r`} className="px-2 py-2 text-right text-green-800 whitespace-nowrap text-xs">{fmt(totalR)}</td>
                    <td key={`${y}-p`} className="px-2 py-2 text-right text-blue-800 whitespace-nowrap text-xs border-r border-gray-100">{fmt(totalP)}</td>
                  </>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function InstitutionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [resources, setResources] = useState<InstalledResource[]>([])
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('financije')
  const [issueFilter, setIssueFilter] = useState<'sve' | 'nerijesene' | 'rijesene'>('sve')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getInstitutions(),
      getBatchesByInstitution(id),
      getFinancialEntriesByInstitution(id),
      getInstalledResourcesByInstitution(id),
      getImportIssuesByInstitution(id),
    ]).then(([institutions, batchList, entryList, resList, issueList]) => {
      setInstitution(institutions.find((i) => i.id === id) ?? null)
      setBatches(batchList)
      setEntries(entryList)
      setResources(resList)
      setIssues(issueList)
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!institution) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-3xl mb-2">🏛️</p>
        <p className="font-medium">Institucija nije pronađena</p>
        <Link to="/institutions" className="text-sm text-blue-600 hover:underline mt-2 inline-block">← Povratak</Link>
      </div>
    )
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'financije', label: 'Financijski pregled' },
    { key: 'batches', label: 'Batch-evi', count: batches.length },
    { key: 'resursi', label: 'Resursi', count: resources.length },
    { key: 'greske', label: 'Greške i upozorenja', count: issues.filter((i) => !i.resolvedAt).length || undefined },
  ]

  const filteredIssues = issues.filter((i) => {
    if (issueFilter === 'nerijesene') return !i.resolvedAt
    if (issueFilter === 'rijesene') return !!i.resolvedAt
    return true
  })

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/institutions" className="hover:text-blue-600 transition-colors">Institucije</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium truncate">{institution.name}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl p-lt-bg flex items-center justify-center p-tx font-bold text-lg shrink-0">
            {institution.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-800 truncate">{institution.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">OIB: {institution.oib}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            {institution.contactName && <span>👤 {institution.contactName}</span>}
            {institution.contactEmail && (
              <a href={`mailto:${institution.contactEmail}`} className="text-blue-600 hover:underline">
                ✉️ {institution.contactEmail}
              </a>
            )}
            {institution.dcCount && <span>🖥️ {institution.dcCount} DC</span>}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
          {[
            { label: 'Batch-evi', value: batches.length },
            { label: 'Financ. unosa', value: entries.length.toLocaleString('hr-HR') },
            { label: 'Resursi', value: resources.length },
            { label: 'Neriješene greške', value: issues.filter((i) => !i.resolvedAt && i.severity === 'error').length },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-lg font-bold text-gray-800">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Financijski pregled */}
      {tab === 'financije' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Pregled po kategorijama</h2>
            <BarChart entries={entries} />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Pivot tablica kategorija × godina</h2>
            <FinancialPivot entries={entries} />
          </div>
        </div>
      )}

      {/* Tab: Batch-evi */}
      {tab === 'batches' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {batches.length === 0 ? (
            <p className="p-8 text-center text-gray-400">Nema batch-eva za ovu instituciju</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {batches.map((b) => (
                <Link
                  key={b.id}
                  to={`/imports/${b.id}`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{b.fileName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {b.uploadedAt.toLocaleDateString('hr-HR')} · {(b.fileSize / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ActiveBadge isActive={b.isActive} />
                    <StatusBadge status={b.processingStatus} />
                    {b.errorCount > 0 && (
                      <span className="text-xs text-red-600">{b.errorCount} grešaka</span>
                    )}
                    {b.warningCount > 0 && (
                      <span className="text-xs text-yellow-600">{b.warningCount} upoz.</span>
                    )}
                    <span className="text-gray-300 text-sm">›</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Resursi */}
      {tab === 'resursi' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {resources.length === 0 ? (
            <p className="p-8 text-center text-gray-400">Nema resursa za ovu instituciju</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Data centar', 'Resurs', 'Jed.', 'Instalirano', 'Ukupno', 'Napomena'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resources.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.dataCenterName || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{r.resourceName}</td>
                      <td className="px-4 py-3 text-gray-500">{r.unit}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{r.installedValue}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.totalCapacity}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Greške i upozorenja */}
      {tab === 'greske' && (
        <div className="space-y-3">
          {/* Filter */}
          <div className="flex gap-2">
            {(['sve', 'nerijesene', 'rijesene'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setIssueFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  issueFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'sve' ? 'Sve' : f === 'nerijesene' ? 'Neriješene' : 'Riješene'}
                <span className="ml-1 opacity-70">
                  ({f === 'sve' ? issues.length : f === 'nerijesene' ? issues.filter((i) => !i.resolvedAt).length : issues.filter((i) => !!i.resolvedAt).length})
                </span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {filteredIssues.length === 0 ? (
              <p className="p-8 text-center text-gray-400">
                {issueFilter === 'nerijesene' ? 'Sve greške su riješene!' : 'Nema grešaka/upozorenja'}
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`px-5 py-4 ${issue.resolvedAt ? 'bg-green-50/40' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <SeverityBadge severity={issue.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{issue.message}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {issue.sheetName} · {issue.fieldName} · Redak: {issue.rowLabel}
                        </p>
                        {issue.originalValue && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Originalna vrijednost: <code className="bg-gray-100 px-1 rounded">{issue.originalValue}</code>
                          </p>
                        )}
                      </div>
                      {issue.resolvedAt && (
                        <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded shrink-0">Riješeno</span>
                      )}
                    </div>
                    {issue.correctedValue && (
                      <p className="text-xs text-green-700 mt-1.5 ml-0">
                        Ispravak: <span className="font-medium">{issue.correctedValue}</span>
                        {issue.resolvedMethod && <span className="ml-1 text-gray-400">({issue.resolvedMethod})</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
