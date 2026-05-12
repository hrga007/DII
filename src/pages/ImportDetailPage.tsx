import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getBatch,
  getFinancialEntries,
  getImportIssues,
  getInstalledResources,
  deleteBatch,
  activateBatch,
  addAuditLog,
} from '../services/firestoreService'
import { currentUser } from '../services/authService'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import { StatusBadge, ActiveBadge, SeverityBadge } from '../components/StatusBadge'
import { exportToExcel, exportToCsv } from '../utils/exportUtils'
import { getAppSettings } from '../hooks/useAppSettings'

type Tab = 'financije' | 'resursi' | 'issues'

const GROUP_LABELS: Record<string, string> = {
  CAPEX:      'CAPEX Infrastruktura',
  ODRZAVANJE: 'Održavanje',
  LICENCE:    'Licence i softver',
  OPEX:       'Operativni troškovi',
  CLOUD:      'Cloud troškovi',
}

function formatEur(v: number | null): string {
  if (v === null) return '–'
  return new Intl.NumberFormat('hr-HR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v)
}

export function ImportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [resources, setResources] = useState<InstalledResource[]>([])
  const [tab, setTab] = useState<Tab>('financije')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      getBatch(id),
      getFinancialEntries(id),
      getImportIssues(id),
      getInstalledResources(id),
    ]).then(([b, e, iss, res]) => {
      setBatch(b); setEntries(e); setIssues(iss); setResources(res)
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }
  if (!batch) return <div className="text-red-600 text-sm p-4 bg-red-50 rounded-xl">Batch nije pronađen</div>

  async function handleDelete() {
    if (!id) return
    setDeleteStep('deleting')
    try {
      await deleteBatch(id)
      navigate('/upload?tab=batches', { replace: true })
    } catch {
      setDeleteStep('idle')
    }
  }

  async function handleActivate() {
    if (!id || !batch?.institutionId) return
    setActivating(true)
    try {
      await activateBatch(id, batch.institutionId)
      const user = currentUser()
      if (user) {
        await addAuditLog({
          userId: user.uid,
          action: 'set_active_batch',
          entityType: 'importBatch',
          entityId: id,
          timestamp: new Date(),
          details: { institutionId: batch.institutionId },
        })
      }
      const updated = await getBatch(id)
      if (updated) setBatch(updated)
    } finally {
      setActivating(false)
    }
  }

  const groups = [...new Set(entries.map((e) => e.categoryGroup))]
  const filteredEntries = filter === 'all' ? entries : entries.filter((e) => e.categoryGroup === filter)

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'financije', label: 'Financije',  count: entries.length },
    { key: 'resursi',   label: 'Resursi',    count: resources.length },
    { key: 'issues',    label: 'Poruke',     count: issues.length },
  ]

  return (
    <div>
      <Link to="/imports" className="inline-flex items-center gap-1 text-sm p-tx hover:underline mb-4">
        ← Batch-evi
      </Link>

      {/* ── Header kartica ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">{batch.fileName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch.importSummary?.institutionName || '–'} · {batch.uploadedAt.toLocaleDateString('hr-HR')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ActiveBadge isActive={batch.isActive} />
            <StatusBadge status={batch.processingStatus} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
          <span className={batch.errorCount > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
            {batch.errorCount} grešaka
          </span>
          <span className={batch.warningCount > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
            {batch.warningCount} upozorenja
          </span>
          <span className="text-gray-400">{entries.length} financijskih unosa</span>
          {batch.fileSize != null && (
            <span className="text-gray-400">{(batch.fileSize / 1024).toFixed(1)} KB</span>
          )}

          {/* ── Actions ── */}
          <div className="sm:ml-auto flex items-center gap-2 mt-1 sm:mt-0">
            {!batch.isActive && batch.institutionId && deleteStep === 'idle' && (
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
              >
                {activating ? (
                  <><span className="animate-spin h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full" /> Aktiviranje…</>
                ) : 'Postavi kao aktivan'}
              </button>
            )}
            {deleteStep === 'idle' && (
              <button
                onClick={() => setDeleteStep('confirm')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
              >
                🗑 Ukloni batch
              </button>
            )}
            {deleteStep === 'confirm' && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                <span className="text-xs text-red-700 font-medium">Trajno obriši sve podatke?</span>
                <button
                  onClick={handleDelete}
                  className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
                >
                  Da, obriši
                </button>
                <button
                  onClick={() => setDeleteStep('idle')}
                  className="text-xs px-3 py-1 rounded-lg bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                >
                  Odustani
                </button>
              </div>
            )}
            {deleteStep === 'deleting' && (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <span className="animate-spin h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full" />
                Brisanje…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabovi — scrollable na mobitelu ── */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === key
                ? 'act-bg act-tx'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
            <span
              className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
              style={tab === key
                ? { backgroundColor: 'rgba(0,0,0,0.2)', color: 'white' }
                : { backgroundColor: 'var(--s-rz)', color: 'var(--t3)' }}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Financije ── */}
      {tab === 'financije' && (
        <>
          {/* Filteri kategorija + Export gumbi */}
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {(['all', ...groups] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setFilter(g)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${
                    filter === g
                      ? 'act-bg act-tx'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {g === 'all' ? 'Sve' : GROUP_LABELS[g] ?? g}
                </button>
              ))}
            </div>
            {filteredEntries.length > 0 && (() => {
              const defExport = getAppSettings().defaultExport
              const baseName  = batch.fileName.replace(/\.[^.]+$/, '')
              return (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => exportToExcel(filteredEntries, `${baseName}-financije.xlsx`)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      defExport === 'xlsx'
                        ? 'btn-primary'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>⬇</span> Excel
                  </button>
                  <button
                    onClick={() => exportToCsv(filteredEntries, `${baseName}-financije.csv`)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      defExport === 'csv'
                        ? 'btn-primary'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>⬇</span> CSV
                  </button>
                </div>
              )
            })()}
          </div>

          {/* Mobilne kartice */}
          <div className="sm:hidden space-y-2">
            {filteredEntries.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-800 leading-tight">{e.categoryName}</p>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                    e.valueType === 'realizirano' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                  }`}>
                    {e.valueType}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-2">{GROUP_LABELS[e.categoryGroup] ?? e.categoryGroup} · {e.year}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{formatEur(e.normalizedValue)}</span>
                  {e.note && <span className="text-xs text-gray-400 italic">{e.note}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop tablica */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Kategorija</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Grupa</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Godina</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Vrsta</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Iznos (EUR)</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Napomena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800">{e.categoryName}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{GROUP_LABELS[e.categoryGroup] ?? e.categoryGroup}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{e.year}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.valueType === 'realizirano' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}>
                          {e.valueType}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">{formatEur(e.normalizedValue)}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{e.note || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Resursi ── */}
      {tab === 'resursi' && (
        <>
          {/* Mobilne kartice */}
          <div className="sm:hidden space-y-2">
            {resources.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <p className="text-xs text-blue-600 font-medium mb-0.5">{r.dataCenterName}</p>
                <p className="text-sm font-semibold text-gray-800 mb-2">{r.resourceName}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div>
                    <span className="block text-gray-400">Instalirano</span>
                    <span className="font-mono font-medium text-gray-700">
                      {r.installedValue !== '' ? String(r.installedValue) : '–'} {r.unit}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400">Kapacitet</span>
                    <span className="font-mono font-medium text-gray-700">
                      {r.totalCapacity !== '' ? String(r.totalCapacity) : '–'}
                    </span>
                  </div>
                </div>
                {r.note && <p className="text-xs text-gray-400 mt-2 italic">{r.note}</p>}
              </div>
            ))}
          </div>

          {/* Desktop tablica */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Data centar</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Resurs</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jedinica</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Instalirano</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Kapacitet</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Napomena</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resources.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600 text-xs">{r.dataCenterName}</td>
                    <td className="px-4 py-2 text-gray-800 font-medium">{r.resourceName}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{r.unit}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.installedValue !== '' ? String(r.installedValue) : '–'}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.totalCapacity !== '' ? String(r.totalCapacity) : '–'}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{r.note || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Issues ── */}
      {tab === 'issues' && (
        <div className="space-y-2">
          {issues.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400">
              <p className="text-3xl mb-2">✅</p>
              <p>Nema grešaka ni upozorenja</p>
            </div>
          ) : (
            issues.map((iss) => (
              <div key={iss.id} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-start gap-3">
                <div className="mt-0.5 shrink-0"><SeverityBadge severity={iss.severity} /></div>
                <div className="flex-1 min-w-0 text-sm">
                  <p className="text-gray-800">{iss.message}</p>
                  <p className="text-gray-400 text-xs mt-0.5 truncate">
                    {iss.sheetName} · {iss.rowLabel} · {iss.fieldName}
                    {iss.originalValue ? ` · "${iss.originalValue}"` : ''}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
