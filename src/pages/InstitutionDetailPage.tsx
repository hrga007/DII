import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { getProvider } from '../providers'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { CategoryGroup } from '../models/financialEntry'
import type { AuditLog, AuditAction } from '../models/auditLog'
import { StatusBadge, ActiveBadge, SeverityBadge } from '../components/StatusBadge'
import { ShareModal } from '../components/ShareModal'
import type { ShareSnapshot } from '../models/shareLink'
import { detectAnomalies } from '../utils/anomalies'
import { computeQualityScore, gradeColor } from '../utils/dataQuality'
import { QualityScoreCard } from '../components/QualityScoreCard'
import { AnomaliesPanel } from '../components/AnomaliesPanel'

const ACTIVITY_LABELS: Record<AuditAction, string> = {
  login:            'Prijava',
  logout:           'Odjava',
  upload:           'Upload datoteke',
  import_complete:  'Import završen',
  import_failed:    'Import neuspješan',
  delete_batch:     'Brisanje batcha',
  set_active_batch: 'Postavljanje aktivnog batcha',
  supersede_batch:  'Zamjena batcha',
  manual_correction:'Ručna korekcija',
  link_institution: 'Povezivanje institucije',
  bulk_normalize:   'Skupna normalizacija',
  reupload:         'Ponovna dostava',
}

function relTimeShort(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)        return 'upravo'
  if (s < 3600)      return `${Math.floor(s / 60)} min`
  if (s < 86400)     return `${Math.floor(s / 3600)} h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d`
  return date.toLocaleDateString('hr-HR')
}

const CATEGORIES: CategoryGroup[] = ['CAPEX', 'LICENCE', 'ODRZAVANJE', 'OPEX', 'CLOUD']
const CAT_LABELS: Record<CategoryGroup, string> = {
  CAPEX: 'CAPEX',
  LICENCE: 'Licence',
  ODRZAVANJE: 'Održavanje',
  OPEX: 'OPEX',
  CLOUD: 'Cloud',
}
const YEARS = [2024, 2025, 2026, 2027, 2028]

type Tab = 'financije' | 'batches' | 'resursi' | 'greske' | 'kvaliteta' | 'aktivnost'

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

// ─── Batch diff ──────────────────────────────────────────────────
interface BatchDiffModalProps {
  batches: ImportBatch[]
  onClose: () => void
}

function BatchDiffModal({ batches, onClose }: BatchDiffModalProps) {
  const [batchAId, setBatchAId] = useState(batches[1]?.id ?? batches[0]?.id ?? '')
  const [batchBId, setBatchBId] = useState(batches[0]?.id ?? '')
  const [entriesA, setEntriesA] = useState<FinancialEntry[]>([])
  const [entriesB, setEntriesB] = useState<FinancialEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!batchAId || !batchBId || batchAId === batchBId) return
    setLoading(true)
    Promise.all([getProvider().getFinancialEntries(batchAId), getProvider().getFinancialEntries(batchBId)])
      .then(([a, b]) => { setEntriesA(a); setEntriesB(b) })
      .finally(() => setLoading(false))
  }, [batchAId, batchBId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const batchName = (id: string) => {
    const b = batches.find(x => x.id === id)
    return b ? `${b.fileName.replace(/\.[^.]+$/, '')} (${b.uploadedAt.toLocaleDateString('hr-HR')})` : id
  }

  // Agregat po categoryGroup × year za oba batcha
  const diffData = useMemo(() => {
    const getValue = (entries: FinancialEntry[], cat: CategoryGroup, year: number) =>
      entries
        .filter(e => e.categoryGroup === cat && e.year === year)
        .reduce((s, e) => s + (e.amount ?? 0), 0)

    return CATEGORIES.map(cat => {
      const years = YEARS.map(year => {
        const a = getValue(entriesA, cat, year)
        const b = getValue(entriesB, cat, year)
        return { year, a, b, delta: b - a }
      })
      const totalA = years.reduce((s, y) => s + y.a, 0)
      const totalB = years.reduce((s, y) => s + y.b, 0)
      return { cat, years, totalA, totalB, totalDelta: totalB - totalA }
    })
  }, [entriesA, entriesB])

  const hasAnyData = diffData.some(r => r.totalA > 0 || r.totalB > 0)
  const changedRows = diffData.filter(r => r.totalDelta !== 0)
  const visibleRows = showAll ? diffData.filter(r => r.totalA > 0 || r.totalB > 0) : changedRows

  const fmt = (v: number) =>
    v === 0 ? '—' : v.toLocaleString('hr-HR', { maximumFractionDigits: 0 })

  const fmtDelta = (v: number) => {
    if (v === 0) return { text: '—', cls: 'text-gray-400' }
    const sign = v > 0 ? '+' : ''
    const abs = Math.abs(v)
    const txt = abs >= 1_000_000
      ? `${sign}${(v / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
      ? `${sign}${(v / 1_000).toFixed(0)}k`
      : `${sign}${v.toLocaleString('hr-HR', { maximumFractionDigits: 0 })}`
    return { text: txt, cls: v > 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold' }
  }

  const sameId = batchAId === batchBId

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col"
        style={{ maxHeight: 'min(92vh, 760px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-800">⇄ Usporedba batcheva</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg"
          >×</button>
        </div>

        {/* Batch selectors */}
        <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Stariji batch (A)</label>
            <select
              value={batchAId}
              onChange={e => setBatchAId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {batches.map(b => (
                <option key={b.id} value={b.id}>{batchName(b.id!)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Noviji batch (B)</label>
            <select
              value={batchBId}
              onChange={e => setBatchBId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {batches.map(b => (
                <option key={b.id} value={b.id}>{batchName(b.id!)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {sameId ? (
            <p className="text-center text-gray-400 py-12 text-sm">Odaberi dva različita batcha za usporedbu</p>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-7 w-7 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : !hasAnyData ? (
            <p className="text-center text-gray-400 py-12 text-sm">Nema financijskih podataka za usporedbu</p>
          ) : (
            <>
              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {changedRows.length === 0 ? (
                  <span className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
                    ✓ Nema razlika u financijskim podacima
                  </span>
                ) : (
                  <>
                    <span className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700">
                      {changedRows.length} kategorij{changedRows.length === 1 ? 'a' : 'e'} s promjenama
                    </span>
                    {changedRows.filter(r => r.totalDelta > 0).length > 0 && (
                      <span className="text-xs px-3 py-1.5 rounded-full bg-green-50 text-green-700">
                        ↑ {changedRows.filter(r => r.totalDelta > 0).length} povećano
                      </span>
                    )}
                    {changedRows.filter(r => r.totalDelta < 0).length > 0 && (
                      <span className="text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-600">
                        ↓ {changedRows.filter(r => r.totalDelta < 0).length} smanjeno
                      </span>
                    )}
                  </>
                )}
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors ml-auto"
                >
                  {showAll ? 'Prikaži samo promjene' : 'Prikaži sve kategorije'}
                </button>
              </div>

              {/* Diff table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap">Kategorija</th>
                      {YEARS.map(y => (
                        <th key={y} colSpan={3} className="text-center px-2 py-2.5 font-semibold text-gray-600 border-l border-gray-200">
                          {y}
                          <div className="flex justify-center gap-3 text-xs font-normal mt-0.5 text-gray-400">
                            <span>A</span><span>B</span><span>Δ</span>
                          </div>
                        </th>
                      ))}
                      <th className="text-center px-3 py-2.5 font-semibold text-gray-600 border-l border-gray-200 whitespace-nowrap">
                        Ukupno Δ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={YEARS.length * 3 + 2} className="px-3 py-8 text-center text-gray-400">
                          Nema kategorija s promjenama
                        </td>
                      </tr>
                    ) : visibleRows.map(row => {
                      const totalDelta = fmtDelta(row.totalDelta)
                      const rowChanged = row.totalDelta !== 0
                      return (
                        <tr key={row.cat} className={rowChanged ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2.5 font-medium text-gray-700 whitespace-nowrap">
                            {CAT_LABELS[row.cat]}
                          </td>
                          {row.years.map(({ year, a, b, delta }) => {
                            const d = fmtDelta(delta)
                            return (
                              <>
                                <td key={`${year}-a`} className="px-2 py-2.5 text-right text-gray-500 border-l border-gray-100 whitespace-nowrap">
                                  {fmt(a)}
                                </td>
                                <td key={`${year}-b`} className="px-2 py-2.5 text-right text-gray-700 whitespace-nowrap">
                                  {fmt(b)}
                                </td>
                                <td key={`${year}-d`} className={`px-2 py-2.5 text-right whitespace-nowrap ${d.cls}`}>
                                  {d.text}
                                </td>
                              </>
                            )
                          })}
                          <td className={`px-3 py-2.5 text-right border-l border-gray-200 whitespace-nowrap ${totalDelta.cls}`}>
                            {totalDelta.text}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Ukupno row */}
                    {visibleRows.length > 0 && (
                      <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                        <td className="px-3 py-2.5 text-gray-700">Ukupno</td>
                        {YEARS.map(y => {
                          const totA = diffData.reduce((s, r) => s + (r.years.find(yr => yr.year === y)?.a ?? 0), 0)
                          const totB = diffData.reduce((s, r) => s + (r.years.find(yr => yr.year === y)?.b ?? 0), 0)
                          const d = fmtDelta(totB - totA)
                          return (
                            <>
                              <td key={`tot-${y}-a`} className="px-2 py-2.5 text-right text-gray-500 border-l border-gray-100">{fmt(totA)}</td>
                              <td key={`tot-${y}-b`} className="px-2 py-2.5 text-right text-gray-800">{fmt(totB)}</td>
                              <td key={`tot-${y}-d`} className={`px-2 py-2.5 text-right ${d.cls}`}>{d.text}</td>
                            </>
                          )
                        })}
                        {(() => {
                          const grandA = diffData.reduce((s, r) => s + r.totalA, 0)
                          const grandB = diffData.reduce((s, r) => s + r.totalB, 0)
                          const d = fmtDelta(grandB - grandA)
                          return (
                            <td className={`px-3 py-2.5 text-right border-l border-gray-200 ${d.cls}`}>{d.text}</td>
                          )
                        })()}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <p className="text-xs text-gray-400 mt-3">
                A = stariji batch · B = noviji batch · Δ = razlika (B − A) · Vrijednosti u EUR
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function InstitutionDetailPage() {
  usePageTitle('Detalji institucije')
  const { id } = useParams<{ id: string }>()
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [resources, setResources] = useState<InstalledResource[]>([])
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('financije')
  const [resDcFilter, setResDcFilter] = useState('')
  const [resNameFilter, setResNameFilter] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [issueFilter, setIssueFilter] = useState<'sve' | 'nerijesene' | 'rijesene'>('sve')
  const [diffOpen, setDiffOpen] = useState(false)
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityFetched, setActivityFetched] = useState(false)
  useEffect(() => {
    if (!id) return
    setLoading(true)
    setLoadError(null)

    // Instituciju dohvaćamo direktnim getDoc — ne ovisi ni o jednom indexu
    getProvider().getInstitutionById(id)
      .then((inst) => {
        if (!inst) { setLoadError('not_found'); return }
        setInstitution(inst)

        // Ostale podatke dohvaćamo paralelno; ako neki upit ne uspije,
        // prikazujemo što možemo (allSettled ne baca za djelomične greške)
        return Promise.allSettled([
          getProvider().getBatchesByInstitution(id),
          getProvider().getFinancialEntriesByInstitution(id),
          getProvider().getInstalledResourcesByInstitution(id),
          getProvider().getImportIssuesByInstitution(id),
        ]).then(([batchRes, entryRes, resRes, issueRes]) => {
          if (batchRes.status === 'fulfilled') setBatches(batchRes.value)
          if (entryRes.status === 'fulfilled') setEntries(entryRes.value)
          if (resRes.status === 'fulfilled') setResources(resRes.value)
          if (issueRes.status === 'fulfilled') setIssues(issueRes.value)

          // Ako je nešto palo, pokaži upozorenje (vjerojatno Firestore index)
          const failed = [batchRes, entryRes, resRes, issueRes].filter(r => r.status === 'rejected')
          if (failed.length > 0) {
            const msg = (failed[0] as PromiseRejectedResult).reason?.message ?? 'Nepoznata greška'
            setLoadError(`partial:${msg}`)
          }
        })
      })
      .catch((err) => setLoadError(err?.message ?? 'Greška pri učitavanju'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (tab !== 'aktivnost' || activityFetched || !id) return
    setActivityLoading(true)
    setActivityFetched(true)
    getProvider().getAuditLogs(300).then(all => {
      const batchIds = new Set(batches.map(b => b.id).filter(Boolean) as string[])
      setActivityLogs(all.filter(l =>
        l.entityId === id ||
        (l.entityType === 'importBatch' && batchIds.has(l.entityId)) ||
        (l.details as Record<string, unknown>)?.institutionId === id
      ))
    }).finally(() => setActivityLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id])

  const anomalies = useMemo(
    () => entries.length > 0 ? detectAnomalies(entries, resources) : [],
    [entries, resources],
  )
  const quality = useMemo(
    () => institution
      ? computeQualityScore({ institution, batches, entries, resources, issues })
      : null,
    [institution, batches, entries, resources, issues],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!institution && loadError === 'not_found') {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-3xl mb-2">🏛️</p>
        <p className="font-medium">Institucija nije pronađena</p>
        <Link to="/institutions" className="text-sm text-blue-600 hover:underline mt-2 inline-block">← Povratak</Link>
      </div>
    )
  }

  if (!institution && loadError) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-3xl mb-2">⚠️</p>
        <p className="font-medium text-red-600">Greška pri učitavanju</p>
        <p className="text-xs text-gray-400 mt-2 max-w-lg mx-auto break-all">{loadError}</p>
        <Link to="/institutions" className="text-sm text-blue-600 hover:underline mt-3 inline-block">← Povratak</Link>
      </div>
    )
  }

  if (!institution || !quality) return null

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'financije', label: 'Financijski pregled' },
    { key: 'batches', label: 'Batch-evi', count: batches.length },
    { key: 'resursi', label: 'Resursi', count: resources.length },
    { key: 'greske', label: 'Greške i upozorenja', count: issues.filter((i) => !i.resolvedAt).length || undefined },
    { key: 'kvaliteta', label: 'Kvaliteta podataka', count: anomalies.length || undefined },
    { key: 'aktivnost', label: 'Aktivnost' },
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
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shrink-0"
          >
            <span>🔗</span> Podijeli
          </button>
          {(() => {
            const c = gradeColor(quality.grade)
            return (
              <button
                onClick={() => setTab('kvaliteta')}
                className={`shrink-0 px-3 py-2 rounded-xl ${c.bg} ${c.text} ${c.ring} ring-1 text-sm font-bold hover:opacity-80 transition-opacity`}
                title={`Ocjena kvalitete podataka: ${quality.score}/100`}
              >
                {quality.grade} <span className="font-normal opacity-70 text-xs">{quality.score}</span>
              </button>
            )
          })()}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
          {[
            { label: 'Batch-evi', value: batches.length, sub: batches.find(b => b.isActive) ? '1 aktivan' : 'nema aktivnog' },
            { label: 'Financ. unosa', value: entries.length.toLocaleString('hr-HR'), sub: 'iz aktivnog batcha' },
            { label: 'Resursi', value: resources.length, sub: undefined },
            { label: 'Neriješene greške', value: issues.filter((i) => !i.resolvedAt && i.severity === 'error').length, sub: undefined },
          ].map(({ label, value, sub }) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-lg font-bold text-gray-800">{value}</p>
              {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        type="institution"
        defaultTitle={`${institution.name} — Pregled`}
        buildSnapshot={(): ShareSnapshot => ({
          filters: { institutionId: institution.id },
          institutions: [institution],
          batches: batches.filter(b => b.isActive),
          entries,
          resources,
        })}
      />

      {/* Parcijalna greška — Firestore index ili sl. */}
      {loadError?.startsWith('partial:') && (
        <div className="mb-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">
          <span className="font-semibold">⚠️ Neki podaci nisu učitani:</span>{' '}
          {loadError.replace('partial:', '')}
          {loadError.includes('index') && (
            <span className="ml-1">— potreban je Firestore composite index (provjeri Firebase Console).</span>
          )}
        </div>
      )}

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

      {/* Diff modal */}
      {diffOpen && batches.length >= 2 && (
        <BatchDiffModal batches={batches} onClose={() => setDiffOpen(false)} />
      )}

      {/* Tab: Batch-evi */}
      {tab === 'batches' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              Financijski pregled i izvješća koriste podatke isključivo iz <strong>aktivnog</strong> batcha.
            </p>
            {batches.length >= 2 && (
              <button
                onClick={() => setDiffOpen(true)}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shrink-0"
              >
                <span>⇄</span>
                <span>Usporedi batcheve</span>
              </button>
            )}
          </div>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {batches.length === 0 ? (
            <p className="p-8 text-center text-gray-400">Nema batch-eva za ovu instituciju</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {batches.map((b) => (
                <Link
                  key={b.id}
                  to={`/imports/${b.id}`}
                  state={{ from: 'institucije', institutionId: id }}
                  className={`flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors ${!b.isActive ? 'opacity-60' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{b.fileName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {b.uploadedAt.toLocaleDateString('hr-HR')} · {(b.fileSize / 1024).toFixed(1)} KB ·{' '}
                      {b.importSummary?.financialEntriesCount ?? 0} unosa
                    </p>
                    {b.isActive && (
                      <p className="text-xs text-emerald-600 font-medium mt-0.5">↑ Ulazi u financijski pregled i izvješća</p>
                    )}
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
        </div>
      )}

      {/* Tab: Resursi */}
      {tab === 'resursi' && (() => {
        const dcNames = [...new Set(resources.map((r) => r.dataCenterName).filter(Boolean))]
        const filtered = resources.filter((r) =>
          (!resDcFilter || r.dataCenterName === resDcFilter) &&
          (!resNameFilter || r.resourceName.toLowerCase().includes(resNameFilter.toLowerCase()))
        )
        const utilPct = (r: InstalledResource) => {
          const inst = Number(r.installedValue)
          const cap  = Number(r.totalCapacity)
          return cap > 0 && inst >= 0 ? Math.min(100, Math.round((inst / cap) * 100)) : null
        }
        return (
          <div>
            {resources.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                <select
                  value={resDcFilter}
                  onChange={(e) => setResDcFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Svi data centri ({dcNames.length})</option>
                  {dcNames.map((dc) => <option key={dc} value={dc}>{dc}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Pretraži resurs..."
                  value={resNameFilter}
                  onChange={(e) => setResNameFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
                />
                {(resDcFilter || resNameFilter) && (
                  <button onClick={() => { setResDcFilter(''); setResNameFilter('') }} className="text-xs text-blue-600 hover:underline">
                    × Očisti
                  </button>
                )}
                <span className="text-xs text-gray-400 self-center ml-auto">{filtered.length} resursa</span>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {filtered.length === 0 ? (
                <p className="p-8 text-center text-gray-400">Nema resursa{resDcFilter || resNameFilter ? ' za odabrani filter' : ' za ovu instituciju'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Data centar', 'Resurs', 'Jed.', 'Instalirano', 'Ukupno', 'Iskorištenost', 'Napomena'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((r) => {
                        const pct = utilPct(r)
                        return (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.dataCenterName || '—'}</td>
                            <td className="px-4 py-3 text-gray-700">{r.resourceName}</td>
                            <td className="px-4 py-3 text-gray-500">{r.unit}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-800">{String(r.installedValue) || '—'}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{String(r.totalCapacity) || '—'}</td>
                            <td className="px-4 py-3">
                              {pct !== null ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-20">
                                    <div
                                      className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500">{pct}%</span>
                                </div>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{r.note || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      })()}

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

      {/* Tab: Kvaliteta podataka */}
      {tab === 'kvaliteta' && (
        <div className="space-y-4">
          <QualityScoreCard result={quality} />
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2 px-1">
              Detektirane nepravilnosti
              {anomalies.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">({anomalies.length})</span>}
            </p>
            <AnomaliesPanel anomalies={anomalies} />
          </div>
        </div>
      )}

      {/* Tab: Aktivnost */}
      {tab === 'aktivnost' && (
        <div>
          {activityLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : activityLogs.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">Nema zabilježene aktivnosti za ovu instituciju</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activityLogs.map((log) => (
                <div
                  key={log.id ?? `${log.entityId}-${log.timestamp.getTime()}`}
                  className="flex items-start gap-4 px-4 py-3 bg-white rounded-xl border border-gray-100"
                >
                  <div className="w-16 shrink-0 text-right">
                    <span className="text-xs text-gray-400" title={log.timestamp.toLocaleString('hr-HR')}>
                      {relTimeShort(log.timestamp)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">
                      {ACTIVITY_LABELS[log.action] ?? log.action}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {log.timestamp.toLocaleString('hr-HR', { dateStyle: 'short', timeStyle: 'short' })}
                      {log.entityType === 'importBatch' && log.entityId && (
                        <>
                          {' · '}
                          <Link to={`/imports/${log.entityId}`} className="text-blue-600 hover:underline font-mono">
                            {log.entityId.slice(0, 8)}…
                          </Link>
                        </>
                      )}
                    </p>
                    {Object.keys(log.details ?? {}).length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {Object.entries(log.details)
                          .filter(([, v]) => typeof v !== 'object')
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
