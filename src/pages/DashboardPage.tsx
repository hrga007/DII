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

function eur(v: number): string {
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
  const totalByGroup = Object.keys(GROUP_LABELS).map((g) => {
    const sum = filtered
      .filter((e) => e.categoryGroup === g)
      .reduce((s, e) => s + (e.normalizedValue ?? 0), 0)
    return { group: g, sum }
  })

  const totalByYear = YEARS.map((y) => {
    const sum = entries
      .filter((e) => e.year === y)
      .reduce((s, e) => s + (e.normalizedValue ?? 0), 0)
    return { year: y, sum }
  })

  if (loading) return <div className="text-gray-500 text-sm">Učitavam...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">Dashboard</h1>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Import batch-evi" value={batches.length} color="blue" />
        <StatCard label="Institucije" value={institutions} color="green" />
        <StatCard label="Greške" value={totalErrors} color={totalErrors > 0 ? 'red' : 'gray'} />
        <StatCard label="Upozorenja" value={totalWarnings} color={totalWarnings > 0 ? 'yellow' : 'gray'} />
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p className="mb-4">Nema podataka. Uvezite Excel datoteku.</p>
          <Link to="/upload" className="text-blue-600 hover:underline text-sm">
            Idi na uvoz →
          </Link>
        </div>
      ) : (
        <>
          {/* Year filter */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setYearFilter('all')}
              className={`text-sm px-4 py-1.5 rounded-full ${yearFilter === 'all' ? 'bg-blue-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Sve godine
            </button>
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setYearFilter(y)}
                className={`text-sm px-4 py-1.5 rounded-full ${yearFilter === y ? 'bg-blue-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* By group */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Ukupno po kategoriji (EUR)</h2>
            <div className="space-y-3">
              {totalByGroup.map(({ group, sum }) => {
                const max = Math.max(...totalByGroup.map((x) => x.sum), 1)
                return (
                  <div key={group}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{GROUP_LABELS[group]}</span>
                      <span className="font-medium text-gray-800">{eur(sum)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(sum / max) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* By year */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Ukupno po godini (EUR)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {YEARS.map((y) => (
                      <th key={y} className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {totalByYear.map(({ year, sum }) => (
                      <td key={year} className="px-3 py-3 text-center font-medium text-gray-800 text-sm">
                        {eur(sum)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
