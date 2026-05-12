import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getBatches, getAllFinancialEntries, getAllImportIssues } from '../services/firestoreService'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'
import { StatCard } from '../components/StatCard'
import { SeverityBadge } from '../components/StatusBadge'
import { getAppSettings } from '../hooks/useAppSettings'

const YEARS = [2024, 2025, 2026, 2027, 2028]

function eur(v: number): string {
  if (v >= 1_000_000)
    return new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 }).format(v / 1_000_000) + ' M €'
  if (v >= 1_000)
    return new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 }).format(v / 1_000) + ' k €'
  return new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 }).format(v) + ' €'
}

function eurFull(v: number): string {
  return new Intl.NumberFormat('hr-HR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v)
}

// ─── Issues modal ────────────────────────────────────────────────
type ModalMode = 'error' | 'warning'

interface IssuesModalProps {
  mode: ModalMode
  batches: ImportBatch[]
  onClose: () => void
}

type ResolutionFilter = 'all' | 'unresolved' | 'resolved'

function IssuesModal({ mode, batches, onClose }: IssuesModalProps) {
  const [issues,     setIssues]     = useState<ImportIssue[]>([])
  const [loading,    setLoading]    = useState(true)
  const [batchFilter, setBatchFilter] = useState<string>('all')
  const [resFilter,  setResFilter]  = useState<ResolutionFilter>('all')

  useEffect(() => {
    getAllImportIssues(mode)
      .then(setIssues)
      .finally(() => setLoading(false))
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const batchMap = new Map(batches.map(b => [b.id!, b]))
  const activeIssues = issues.filter(i => batchMap.has(i.batchId))
  const batchIds = [...new Set(activeIssues.map(i => i.batchId))]

  const afterBatch = batchFilter === 'all' ? activeIssues : activeIssues.filter(i => i.batchId === batchFilter)
  const filtered = resFilter === 'all'
    ? afterBatch
    : resFilter === 'resolved'
      ? afterBatch.filter(i => !!i.resolvedAt)
      : afterBatch.filter(i => !i.resolvedAt)

  const resolvedCount   = afterBatch.filter(i => !!i.resolvedAt).length
  const unresolvedCount = afterBatch.filter(i => !i.resolvedAt).length

  const title  = mode === 'error' ? 'Greške' : 'Upozorenja'
  const accent = mode === 'error' ? 'text-red-600' : 'text-yellow-600'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col animate-fade-in"
        style={{ maxHeight: 'min(90vh, 700px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className={`text-base font-bold ${accent}`}>
              {mode === 'error' ? '🔴' : '🟡'} {title}
            </h2>
            {!loading && (
              <p className="text-xs text-gray-400 mt-0.5">
                {activeIssues.length} {mode === 'error' ? 'grešaka' : 'upozorenja'} u{' '}
                {batchIds.length} batch-eva
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Filter: Sve / Neriješene / Riješene */}
        {!loading && (
          <div className="flex gap-1.5 px-5 py-2.5 border-b border-gray-100 shrink-0">
            {([
              { key: 'all',        label: `Sve (${afterBatch.length})` },
              { key: 'unresolved', label: `Neriješene (${unresolvedCount})` },
              { key: 'resolved',   label: `Riješene (${resolvedCount})` },
            ] as { key: ResolutionFilter; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setResFilter(key)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${
                  resFilter === key ? 'act-bg act-tx' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Batch filter */}
        {!loading && batchIds.length > 1 && (
          <div className="flex gap-1.5 px-5 py-3 border-b border-gray-100 overflow-x-auto shrink-0">
            <button
              onClick={() => setBatchFilter('all')}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${
                batchFilter === 'all' ? 'act-bg act-tx' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Svi batch-evi ({issues.length})
            </button>
            {batchIds.map(bid => {
              const b = batchMap.get(bid)
              const cnt = issues.filter(i => i.batchId === bid).length
              return (
                <button
                  key={bid}
                  onClick={() => setBatchFilter(bid)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors max-w-[160px] truncate ${
                    batchFilter === bid ? 'act-bg act-tx' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={b?.fileName}
                >
                  {b ? b.fileName.replace(/\.[^.]+$/, '') : bid.slice(0, 8)} ({cnt})
                </button>
              )
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-7 w-7 border-4 spin-primary rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm">Nema {mode === 'error' ? 'grešaka' : 'upozorenja'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((iss) => {
                const b = batchMap.get(iss.batchId)
                return (
                  <div
                    key={iss.id}
                    className={`flex items-start gap-3 rounded-xl px-4 py-3 ${iss.resolvedAt ? 'bg-green-50' : 'bg-gray-50'}`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <SeverityBadge severity={iss.severity} />
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <p className={iss.resolvedAt ? 'text-gray-400 line-through' : 'text-gray-800'}>
                        {iss.message}
                      </p>
                      <p className="text-gray-400 text-xs mt-0.5 truncate">
                        {iss.sheetName} · {iss.rowLabel} · {iss.fieldName}
                        {iss.originalValue ? ` · "${iss.originalValue}"` : ''}
                      </p>
                      {iss.resolvedAt && (
                        <p className="text-xs text-green-600 mt-0.5">
                          ✓ Riješeno · {iss.resolvedMethod}
                          {iss.correctedValue ? ` → "${iss.correctedValue}"` : ''}
                        </p>
                      )}
                      {b && (
                        <Link
                          to={`/imports/${b.id}`}
                          onClick={onClose}
                          className="text-xs p-tx hover:underline mt-1 inline-block"
                        >
                          {b.importSummary?.institutionName
                            ? `${b.importSummary.institutionName} — `
                            : ''}
                          {b.fileName} →
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Prikazano: {filtered.length} od {issues.length}
            </p>
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Zatvori
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const appSettings = getAppSettings()

  const [batches,    setBatches]    = useState<ImportBatch[]>([])
  const [entries,    setEntries]    = useState<FinancialEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [yearFilter, setYearFilter] = useState<number | 'all'>(appSettings.defaultYear)
  const [modal,      setModal]      = useState<ModalMode | null>(null)
  const closeModal = useCallback(() => setModal(null), [])

  useEffect(() => {
    Promise.all([getBatches(), getAllFinancialEntries()])
      .then(([b, e]) => { setBatches(b); setEntries(e) })
      .finally(() => setLoading(false))
  }, [])

  const activeBatches = batches.filter(b => b.isActive)
  const activeIds     = new Set(activeBatches.map(b => b.id!))

  const totalErrors   = activeBatches.reduce((s, b) => s + b.errorCount, 0)
  const totalWarnings = activeBatches.reduce((s, b) => s + b.warningCount, 0)
  const institutions  = new Set(activeBatches.map(b => b.institutionId).filter(Boolean)).size

  const activeEntries = entries.filter(e => activeIds.has(e.batchId))
  const filtered = yearFilter === 'all' ? activeEntries : activeEntries.filter(e => e.year === yearFilter)

  // ── Top N categories by name ──────────────────────────────────
  const topN = appSettings.topCategoriesCount
  const catMap = new Map<string, number>()
  filtered.forEach(e => {
    catMap.set(e.categoryName, (catMap.get(e.categoryName) ?? 0) + (e.normalizedValue ?? 0))
  })
  const topCategories = [...catMap.entries()]
    .map(([name, sum]) => ({ name, sum }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, topN)
  const maxCat = Math.max(...topCategories.map(x => x.sum), 1)

  // ── Yearly totals (all entries, ignoring year filter) ────────
  const totalByYear = YEARS.map(y => ({
    year: y,
    sum: activeEntries.filter(e => e.year === y).reduce((s, e) => s + (e.normalizedValue ?? 0), 0),
  }))
  const maxYear = Math.max(...totalByYear.map(x => x.sum), 1)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 spin-primary rounded-full" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--t1)' }}>Dashboard</h1>

      {/* Stat kartice */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Batch-evi"   value={activeBatches.length} color="blue" />
        <StatCard label="Institucije" value={institutions}   color="green" />
        <StatCard
          label="Greške"
          value={totalErrors}
          color={totalErrors > 0 ? 'red' : 'gray'}
          onClick={totalErrors > 0 ? () => setModal('error') : undefined}
        />
        <StatCard
          label="Upozorenja"
          value={totalWarnings}
          color={totalWarnings > 0 ? 'yellow' : 'gray'}
          onClick={totalWarnings > 0 ? () => setModal('warning') : undefined}
        />
      </div>

      {/* Issues modal */}
      {modal && (
        <IssuesModal mode={modal} batches={activeBatches} onClose={closeModal} />
      )}

      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-base mb-4 font-medium">Nema podataka za prikaz</p>
          <Link to="/upload" className="btn-primary inline-block text-sm px-5 py-2.5 rounded-lg">
            Uvezi Excel datoteku
          </Link>
        </div>
      ) : (
        <>
          {/* Filter po godini */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            {(['all', ...YEARS] as const).map(y => (
              <button
                key={y}
                onClick={() => setYearFilter(y)}
                className={`shrink-0 text-sm px-4 py-1.5 rounded-full transition-colors border ${
                  yearFilter === y
                    ? 'act-bg act-tx border-transparent'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {y === 'all' ? 'Sve godine' : y}
              </button>
            ))}
          </div>

          {/* ── Top N kategorija ────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Iznos po kategoriji (EUR)</h2>
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }}
              >
                Top {topCategories.length}
              </span>
            </div>
            {topCategories.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Nema podataka za odabranu godinu
              </p>
            ) : (
              <div className="space-y-3">
                {topCategories.map(({ name, sum }, idx) => {
                  const pct = Math.round((sum / maxCat) * 100)
                  // Opacity fades from 1.0 (rank 1) to 0.45 (rank N)
                  const opacity = 1 - (idx / Math.max(topCategories.length - 1, 1)) * 0.55
                  return (
                    <div key={name}>
                      <div className="flex justify-between items-center mb-1.5 gap-2">
                        <span
                          className="text-sm font-medium text-gray-700 truncate"
                          style={{ maxWidth: '60%' }}
                          title={name}
                        >
                          {name}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums shrink-0">
                          {eurFull(sum)}
                        </span>
                      </div>
                      <div
                        className="w-full rounded-full h-2 overflow-hidden"
                        style={{ backgroundColor: 'var(--s-rz)' }}
                      >
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: 'var(--p)', opacity }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Ukupno po godini ────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">Ukupno po godini (EUR)</h2>
            <div className="flex items-end gap-2 sm:gap-4 h-32">
              {totalByYear.map(({ year, sum }) => {
                const pct = maxYear > 0 ? (sum / maxYear) * 100 : 0
                return (
                  <div key={year} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 tabular-nums hidden sm:block">
                      {eur(sum)}
                    </span>
                    <div
                      className="w-full rounded-t-lg overflow-hidden relative"
                      style={{ height: '80px', backgroundColor: 'var(--s-rz)' }}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-500"
                        style={{
                          height: `${pct}%`,
                          backgroundColor: yearFilter === year ? 'var(--p)' : 'var(--p-mu)',
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-600">{year}</span>
                    <span className="text-xs text-gray-400 sm:hidden">{eur(sum)}</span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Prikazuju se svi podaci bez obzira na filter godine
            </p>
          </div>
        </>
      )}
    </div>
  )
}
