import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBatches, getAllFinancialEntries } from '../services/firestoreService'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry } from '../models/financialEntry'
import { StatCard } from '../components/StatCard'

const YEARS = [2024, 2025, 2026, 2027, 2028]

const GROUP_LABELS: Record<string, string> = {
  CAPEX: 'CAPEX',
  ODRZAVANJE: 'Održavanje',
  LICENCE: 'Licence',
  OPEX: 'Operativni',
  CLOUD: 'Cloud',
}

const GROUP_COLORS: Record<string, string> = {
  CAPEX:      'bg-blue-500',
  ODRZAVANJE: 'bg-indigo-500',
  LICENCE:    'bg-violet-500',
  OPEX:       'bg-cyan-500',
  CLOUD:      'bg-sky-400',
}

function eur(v: number): string {
  if (v >= 1_000_000)
    return new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 }).format(v / 1_000_000) + ' M €'
  if (v >= 1_000)
    return new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 }).format(v / 1_000) + ' k €'
  return new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 }).format(v) + ' €'
}

function eurFull(v: number): string {
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function DashboardPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all')

  useEffect(() => {
    Promise.all([getBatches(), getAllFinancialEntries()])
      .then(([b, e]) => { setBatches(b); setEntries(e) })
      .finally(() => setLoading(false))
  }, [])

  const totalErrors = batches.reduce((s, b) => s + b.errorCount, 0)
  const totalWarnings = batches.reduce((s, b) => s + b.warningCount, 0)
  const institutions = new Set(batches.map((b) => b.institutionId).filter(Boolean)).size

  const filtered = yearFilter === 'all' ? entries : entries.filter((e) => e.year === yearFilter)

  const totalByGroup = Object.keys(GROUP_LABELS).map((g) => ({
    group: g,
    sum: filtered.filter((e) => e.categoryGroup === g).reduce((s, e) => s + (e.normalizedValue ?? 0), 0),
  }))

  const totalByYear = YEARS.map((y) => ({
    year: y,
    sum: entries.filter((e) => e.year === y).reduce((s, e) => s + (e.normalizedValue ?? 0), 0),
  }))

  const maxYear = Math.max(...totalByYear.map((x) => x.sum), 1)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-5">Dashboard</h1>

      {/* ── Stat cards 2×2 na mobitelu, 4×1 na desktopu ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Batch-evi" value={batches.length} color="blue" />
        <StatCard label="Institucije" value={institutions} color="green" />
        <StatCard label="Greške" value={totalErrors} color={totalErrors > 0 ? 'red' : 'gray'} />
        <StatCard label="Upozorenja" value={totalWarnings} color={totalWarnings > 0 ? 'yellow' : 'gray'} />
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-base mb-4 font-medium">Nema podataka za prikaz</p>
          <Link
            to="/upload"
            className="inline-block bg-blue-700 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-blue-800 transition-colors"
          >
            Uvezi Excel datoteku
          </Link>
        </div>
      ) : (
        <>
          {/* ── Filter po godini ── */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            {(['all', ...YEARS] as const).map((y) => (
              <button
                key={y}
                onClick={() => setYearFilter(y)}
                className={`shrink-0 text-sm px-4 py-1.5 rounded-full transition-colors ${
                  yearFilter === y
                    ? 'bg-blue-700 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {y === 'all' ? 'Sve godine' : y}
              </button>
            ))}
          </div>

          {/* ── Bar chart po kategoriji ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Iznos po kategoriji (EUR)</h2>
            <div className="space-y-3">
              {totalByGroup.map(({ group, sum }) => {
                const max = Math.max(...totalByGroup.map((x) => x.sum), 1)
                const pct = Math.round((sum / max) * 100)
                return (
                  <div key={group}>
                    <div className="flex justify-between items-center text-sm mb-1.5">
                      <span className="font-medium text-gray-700">{GROUP_LABELS[group]}</span>
                      <span className="text-gray-500 text-xs tabular-nums">{eurFull(sum)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${GROUP_COLORS[group] ?? 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Bar chart po godini ── */}
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
                    <div className="w-full bg-gray-100 rounded-t-lg overflow-hidden relative" style={{ height: '80px' }}>
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-blue-600 rounded-t-lg transition-all duration-500"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-600">{year}</span>
                    <span className="text-xs text-gray-400 sm:hidden">{eur(sum)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
