import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBatches, getAllFinancialEntries } from '../services/firestoreService'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry } from '../models/financialEntry'
import { StatCard } from '../components/StatCard'
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

export function DashboardPage() {
  const appSettings = getAppSettings()

  const [batches,    setBatches]    = useState<ImportBatch[]>([])
  const [entries,    setEntries]    = useState<FinancialEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [yearFilter, setYearFilter] = useState<number | 'all'>(appSettings.defaultYear)

  useEffect(() => {
    Promise.all([getBatches(), getAllFinancialEntries()])
      .then(([b, e]) => { setBatches(b); setEntries(e) })
      .finally(() => setLoading(false))
  }, [])

  const totalErrors   = batches.reduce((s, b) => s + b.errorCount, 0)
  const totalWarnings = batches.reduce((s, b) => s + b.warningCount, 0)
  const institutions  = new Set(batches.map(b => b.institutionId).filter(Boolean)).size

  const filtered = yearFilter === 'all' ? entries : entries.filter(e => e.year === yearFilter)

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
    sum: entries.filter(e => e.year === y).reduce((s, e) => s + (e.normalizedValue ?? 0), 0),
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
        <StatCard label="Batch-evi"   value={batches.length} color="blue" />
        <StatCard label="Institucije" value={institutions}   color="green" />
        <StatCard label="Greške"      value={totalErrors}    color={totalErrors   > 0 ? 'red'    : 'gray'} />
        <StatCard label="Upozorenja"  value={totalWarnings}  color={totalWarnings > 0 ? 'yellow' : 'gray'} />
      </div>

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
