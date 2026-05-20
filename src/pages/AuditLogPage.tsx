import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '../hooks/usePageTitle'
import { getProvider } from '../providers'
import type { AuditLog, AuditAction } from '../models/auditLog'

const ACTION_LABELS: Record<AuditAction, string> = {
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

const ACTION_COLORS: Record<AuditAction, string> = {
  login:            'bg-green-100 text-green-800',
  logout:           'bg-gray-100 text-gray-600',
  upload:           'bg-blue-100 text-blue-800',
  import_complete:  'bg-green-100 text-green-800',
  import_failed:    'bg-red-100 text-red-700',
  delete_batch:     'bg-red-100 text-red-700',
  set_active_batch: 'bg-purple-100 text-purple-800',
  supersede_batch:  'bg-amber-100 text-amber-800',
  manual_correction:'bg-sky-100 text-sky-800',
  link_institution: 'bg-indigo-100 text-indigo-800',
  bulk_normalize:   'bg-teal-100 text-teal-800',
  reupload:         'bg-blue-100 text-blue-800',
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  <  1) return 'upravo'
  if (mins  < 60) return `${mins} min`
  if (hours < 24) return `${hours} h`
  if (days  <  7) return `${days} d`
  return date.toLocaleDateString('hr-HR')
}

function LogRow({ log, expanded, onToggle }: {
  log: AuditLog
  expanded: boolean
  onToggle: () => void
}) {
  const color = ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'
  const label = ACTION_LABELS[log.action] ?? log.action
  const hasDetails = Object.keys(log.details ?? {}).length > 0

  const entityLink = () => {
    if (log.entityType === 'importBatch' && log.entityId) {
      return <Link to={`/imports/${log.entityId}`} className="text-blue-600 hover:underline text-xs font-mono">{log.entityId.slice(0, 8)}…</Link>
    }
    if (log.entityType === 'institution' && log.entityId) {
      return <Link to={`/institucije/${log.entityId}`} className="text-blue-600 hover:underline text-xs font-mono">{log.entityId.slice(0, 8)}…</Link>
    }
    if (log.entityId) {
      return <span className="text-xs font-mono text-gray-400">{log.entityId.slice(0, 8)}…</span>
    }
    return null
  }

  return (
    <>
      <tr
        className="hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={hasDetails ? onToggle : undefined}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className="text-xs"
            style={{ color: 'var(--t3)' }}
            title={log.timestamp.toLocaleString('hr-HR')}
          >
            {relativeTime(log.timestamp)}
          </span>
          <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
            {log.timestamp.toLocaleString('hr-HR', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
            {label}
          </span>
        </td>
        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--t3)' }}>
          {log.userId.length > 20 ? log.userId.slice(0, 16) + '…' : log.userId}
        </td>
        <td className="px-4 py-3">
          <div className="text-xs" style={{ color: 'var(--t3)' }}>
            <span className="font-medium">{log.entityType}</span>
          </div>
          <div>{entityLink()}</div>
        </td>
        <td className="px-4 py-3 text-center">
          {hasDetails && (
            <button
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{ color: 'var(--t3)', backgroundColor: expanded ? 'var(--s-rz)' : 'transparent' }}
              onClick={(e) => { e.stopPropagation(); onToggle() }}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr>
          <td colSpan={5} className="px-4 pb-3">
            <pre
              className="text-xs rounded-lg p-3 overflow-x-auto"
              style={{ backgroundColor: 'var(--s-rz)', color: 'var(--t2)' }}
            >
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

export function AuditLogPage() {
  usePageTitle('Audit log')
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('')
  const [search, setSearch]             = useState('')
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [page, setPage]                 = useState(0)
  const PAGE_SIZE = 50

  const { data: logs = [], isLoading, error } = useQuery<AuditLog[]>({
    queryKey: ['auditLogs'],
    queryFn:  () => getProvider().getAuditLogs(500),
    staleTime: 30_000,
  })

  const filtered = useMemo(() => {
    let result = logs
    if (actionFilter) result = result.filter(l => l.action === actionFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(l =>
        l.userId.toLowerCase().includes(q) ||
        l.entityId.toLowerCase().includes(q) ||
        l.entityType.toLowerCase().includes(q) ||
        JSON.stringify(l.details).toLowerCase().includes(q)
      )
    }
    return result
  }, [logs, actionFilter, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const uniqueActions = useMemo(
    () => [...new Set(logs.map(l => l.action))].sort(),
    [logs]
  )

  function handleFilterChange(val: string) {
    setActionFilter(val as AuditAction | '')
    setPage(0)
  }

  function handleSearch(val: string) {
    setSearch(val)
    setPage(0)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>Audit log</h1>
        <span className="text-sm" style={{ color: 'var(--t3)' }}>
          {filtered.length} / {logs.length} zapisa
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="search"
          placeholder="Pretraži (korisnički ID, entitet, detalji…)"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--bd)',
            color: 'var(--t1)',
          }}
        />
        <select
          value={actionFilter}
          onChange={e => handleFilterChange(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--bd)',
            color: 'var(--t1)',
          }}
        >
          <option value="">Sve akcije</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--bd)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--t3)' }}>
            Greška pri učitavanju: {String(error)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: 'var(--t3)' }}>
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">Nema audit log zapisa</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--s-rz)' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--t3)' }}>Vrijeme</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--t3)' }}>Akcija</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--t3)' }}>Korisnik</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--t3)' }}>Entitet</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold" style={{ color: 'var(--t3)' }}>Detalji</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--bd)' }}>
                {paged.map(log => (
                  <LogRow
                    key={log.id ?? `${log.entityId}-${log.timestamp.getTime()}`}
                    log={log}
                    expanded={expandedId === (log.id ?? '')}
                    onToggle={() => setExpandedId(
                      expandedId === (log.id ?? '') ? null : (log.id ?? '')
                    )}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
            style={{ backgroundColor: 'var(--s-rz)', color: 'var(--t2)' }}
          >
            ← Prethodna
          </button>
          <span className="text-sm" style={{ color: 'var(--t3)' }}>
            Stranica {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
            style={{ backgroundColor: 'var(--s-rz)', color: 'var(--t2)' }}
          >
            Sljedeća →
          </button>
        </div>
      )}
    </div>
  )
}
