import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '../hooks/usePageTitle'
import { getProvider } from '../providers'
import { useAuth } from '../hooks/useAuth'
import type { AuditLog, AuditAction } from '../models/auditLog'

const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Prijava',
  logout: 'Odjava',
  upload: 'Upload',
  import_complete: 'Uvoz završen',
  import_failed: 'Uvoz neuspješan',
  delete_batch: 'Brisanje batcha',
  set_active_batch: 'Postavljanje aktivnog',
  supersede_batch: 'Zamjena batcha',
  manual_correction: 'Ručna korekcija',
  link_institution: 'Povezivanje institucije',
  bulk_normalize: 'Masovna normalizacija',
  reupload: 'Ponovni upload',
}

const PAGE_SIZE = 20

function relativeTime(date: Date): string {
  const now = Date.now()
  const diff = Math.floor((now - date.getTime()) / 1000)
  if (diff < 60) return 'upravo'
  if (diff < 3600) return `prije ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `prije ${Math.floor(diff / 3600)} sati`
  if (diff < 86400 * 7) return `prije ${Math.floor(diff / 86400)} dana`
  return date.toLocaleDateString('hr-HR')
}

export function AuditPage() {
  usePageTitle('Audit log')
  const { user } = useAuth()
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => getProvider().getAuditLogs(200),
  })

  const filtered = useMemo(() => {
    return logs.filter((log: AuditLog) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false
      if (dateFrom) {
        const from = new Date(dateFrom)
        if (log.timestamp < from) return false
      }
      if (dateTo) {
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        if (log.timestamp > to) return false
      }
      return true
    })
  }, [logs, actionFilter, dateFrom, dateTo])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when filters change
  const handleFilterChange = (fn: () => void) => {
    fn()
    setPage(0)
  }

  const uniqueActions = useMemo(() => {
    return [...new Set(logs.map((l: AuditLog) => l.action))] as AuditAction[]
  }, [logs])

  // Only admin can see this page
  const isAdmin = (user as { role?: string } | null)?.role === 'admin'

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8">
        <div className="text-5xl">🔒</div>
        <h2 className="text-lg font-semibold text-gray-800">Pristup zabranjen</h2>
        <p className="text-sm text-gray-500">Ova stranica je dostupna samo administratorima.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-xl font-bold text-gray-800">Audit log</h1>
        {!isLoading && (
          <span className="text-sm text-gray-500">{filtered.length} zapisa</span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Action filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Akcija</label>
            <select
              value={actionFilter}
              onChange={e => handleFilterChange(() => setActionFilter(e.target.value as AuditAction | 'all'))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Sve akcije</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{ACTION_LABELS[action] ?? action}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Od datuma</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => handleFilterChange(() => setDateFrom(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Do datuma</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => handleFilterChange(() => setDateTo(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {(actionFilter !== 'all' || dateFrom || dateTo) && (
          <div className="mt-3">
            <button
              onClick={() => { setActionFilter('all'); setDateFrom(''); setDateTo(''); setPage(0) }}
              className="text-xs text-blue-600 hover:underline"
            >
              Ukloni sve filtere
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 spin-primary rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">Nema audit zapisa</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vrijeme</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Korisnik</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Akcija</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Entitet</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Detalji</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((log: AuditLog) => (
                    <tr key={log.id ?? `${log.timestamp.getTime()}-${log.action}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap" title={log.timestamp.toLocaleString('hr-HR')}>
                        {relativeTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono truncate max-w-[120px]" title={log.userId}>
                        {log.userId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        <span className="text-gray-400">{log.entityType}</span>
                        <span className="mx-1 text-gray-300">/</span>
                        <span className="font-mono">{log.entityId.slice(0, 12)}…</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate" title={JSON.stringify(log.details)}>
                        {Object.entries(log.details)
                          .slice(0, 2)
                          .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {paginated.map((log: AuditLog) => (
              <div key={log.id ?? `${log.timestamp.getTime()}-${log.action}`} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="text-xs text-gray-400" title={log.timestamp.toLocaleString('hr-HR')}>
                    {relativeTime(log.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-mono">{log.userId.slice(0, 16)}…</p>
                <p className="text-xs text-gray-400 mt-1">
                  {log.entityType} / {log.entityId.slice(0, 12)}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-500">
                Stranica {page + 1} od {totalPages} · {filtered.length} zapisa
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Prethodno
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Sljedeće →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
