import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { getInstitutions } from '../services/firestoreService'
import { getBatches } from '../services/firestoreService'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import { StatusBadge } from '../components/StatusBadge'

interface InstitutionRow {
  institution: Institution
  batches: ImportBatch[]
  totalEntries: number
  lastUpload: Date | null
}

export function InstitutionsPage() {
  usePageTitle('Institucije')
  const [rows, setRows] = useState<InstitutionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([getInstitutions(), getBatches()]).then(([institutions, batches]) => {
      const mapped: InstitutionRow[] = institutions.map((inst) => {
        const ibs = batches.filter((b) => b.institutionId === inst.id)
        const totalEntries = ibs.reduce((s, b) => s + (b.importSummary?.financialEntriesCount ?? 0), 0)
        const dates = ibs.map((b) => b.uploadedAt.getTime())
        return {
          institution: inst,
          batches: ibs,
          totalEntries,
          lastUpload: dates.length ? new Date(Math.max(...dates)) : null,
        }
      })
      // Sort: institutions with batches first, then by name
      mapped.sort((a, b) => {
        if (b.batches.length !== a.batches.length) return b.batches.length - a.batches.length
        return a.institution.name.localeCompare(b.institution.name, 'hr')
      })
      setRows(mapped)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = rows.filter((r) =>
    r.institution.name.toLowerCase().includes(search.toLowerCase()) ||
    r.institution.oib.includes(search)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-xl font-bold text-gray-800">Institucije</h1>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži naziv ili OIB..."
            className="pl-8 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Institucije', value: rows.length, icon: '🏛️' },
          { label: 'Batch-evi ukupno', value: rows.reduce((s, r) => s + r.batches.length, 0), icon: '📦' },
          { label: 'Financ. unosa', value: rows.reduce((s, r) => s + r.totalEntries, 0).toLocaleString('hr-HR'), icon: '📊' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{icon} {label}</p>
            <p className="text-xl font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-3xl mb-2">🏛️</p>
          <p className="font-medium">{search ? 'Nema rezultata pretrage' : 'Nema institucija'}</p>
          <p className="text-sm mt-1">Institucije se kreiraju automatski pri uvozu Excel datoteka</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const id = row.institution.id!
            const isOpen = expanded === id
            const hasErrors = row.batches.some((b) => b.errorCount > 0)

            return (
              <div key={id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Institution header row */}
                <div className="flex items-center gap-3 p-4 sm:p-5 hover:bg-gray-50 transition-colors">
                  {/* Icon — links to InstitutionDetailPage */}
                  <Link
                    to={`/institucije/${id}`}
                    className="shrink-0 w-10 h-10 rounded-xl p-lt-bg flex items-center justify-center p-tx font-bold text-sm hover:opacity-70 transition-opacity"
                    title="Otvori detalje institucije"
                  >
                    {row.institution.name.charAt(0).toUpperCase()}
                  </Link>

                  {/* Expand button: main info + stats + chevron */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{row.institution.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">OIB: {row.institution.oib}</p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500 mr-2">
                    <span title="Batch-evi">
                      <span className="font-semibold text-gray-700">{row.batches.length}</span>
                      <span className="text-xs ml-1">batch-eva</span>
                    </span>
                    <span title="Financijski unosi">
                      <span className={`font-semibold ${hasErrors ? 'text-red-600' : 'text-gray-700'}`}>
                        {row.totalEntries}
                      </span>
                      <span className="text-xs ml-1">unosa</span>
                    </span>
                    {row.lastUpload && (
                      <span className="text-xs text-gray-400">
                        {row.lastUpload.toLocaleDateString('hr-HR')}
                      </span>
                    )}
                  </div>

                  {/* Mobile stats */}
                  <div className="sm:hidden flex flex-col items-end text-xs text-gray-500 mr-1">
                    <span>{row.batches.length} batch-eva</span>
                    {row.lastUpload && (
                      <span className="text-gray-400">{row.lastUpload.toLocaleDateString('hr-HR')}</span>
                    )}
                  </div>

                  {/* Chevron */}
                  <span className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                  </button>
                </div>

                {/* Expanded batch list */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {row.batches.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-gray-400 text-center">Nema batch-eva za ovu instituciju</p>
                    ) : (
                      <>
                        {/* Contact info */}
                        {(row.institution.contactName || row.institution.contactEmail) && (
                          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
                            {row.institution.contactName && (
                              <span>👤 {row.institution.contactName}</span>
                            )}
                            {row.institution.contactEmail && (
                              <a href={`mailto:${row.institution.contactEmail}`} className="p-tx hover:underline">
                                ✉️ {row.institution.contactEmail}
                              </a>
                            )}
                            {row.institution.dcCount && (
                              <span>🖥️ {row.institution.dcCount} DC</span>
                            )}
                          </div>
                        )}

                        {/* Batch list */}
                        <div className="divide-y divide-gray-50">
                          {row.batches.map((b) => (
                            <Link
                              key={b.id}
                              to={`/imports/${b.id}`}
                              className="flex items-center gap-3 px-5 py-3 transition-colors group hover:bg-gray-50"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700 truncate" style={{ transition: 'color 0.15s' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--p-tx)')}
                                  onMouseLeave={e => (e.currentTarget.style.color = '')}
                                >
                                  {b.fileName}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {b.uploadedAt.toLocaleDateString('hr-HR')} ·{' '}
                                  {(b.fileSize / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="hidden sm:flex gap-2 text-xs">
                                  {b.errorCount > 0 && (
                                    <span className="text-red-600">{b.errorCount} grešaka</span>
                                  )}
                                  {b.warningCount > 0 && (
                                    <span className="text-yellow-600">{b.warningCount} upoz.</span>
                                  )}
                                  <span className="text-gray-400">
                                    {b.importSummary?.financialEntriesCount ?? 0} unosa
                                  </span>
                                </div>
                                <StatusBadge status={b.processingStatus} />
                                <span className="text-gray-300 p-tx" style={{ opacity: 0.5 }}>›</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
