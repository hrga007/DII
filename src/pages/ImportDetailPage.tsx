import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getBatch,
  getFinancialEntries,
  getImportIssues,
  getInstalledResources,
} from '../services/firestoreService'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import { StatusBadge, SeverityBadge } from '../components/StatusBadge'

type Tab = 'financije' | 'resursi' | 'issues'

const GROUP_LABELS: Record<string, string> = {
  CAPEX: 'CAPEX Infrastruktura',
  ODRZAVANJE: 'Održavanje',
  LICENCE: 'Licence i softver',
  OPEX: 'Operativni troškovi',
  CLOUD: 'Cloud troškovi',
}

function formatEur(v: number | null): string {
  if (v === null) return '–'
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function ImportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [resources, setResources] = useState<InstalledResource[]>([])
  const [tab, setTab] = useState<Tab>('financije')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!id) return
    Promise.all([
      getBatch(id),
      getFinancialEntries(id),
      getImportIssues(id),
      getInstalledResources(id),
    ]).then(([b, e, iss, res]) => {
      setBatch(b)
      setEntries(e)
      setIssues(iss)
      setResources(res)
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-gray-500 text-sm">Učitavam...</div>
  if (!batch) return <div className="text-red-600 text-sm">Batch nije pronađen</div>

  const groups = [...new Set(entries.map((e) => e.categoryGroup))]

  const filteredEntries = filter === 'all' ? entries : entries.filter((e) => e.categoryGroup === filter)

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link to="/imports" className="text-sm text-blue-600 hover:underline">← Batch-evi</Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">{batch.fileName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch.importSummary?.institutionName || '–'} · {batch.uploadedAt.toLocaleDateString('hr-HR')}
            </p>
          </div>
          <StatusBadge status={batch.processingStatus} />
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <span className={batch.errorCount > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
            {batch.errorCount} grešaka
          </span>
          <span className={batch.warningCount > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
            {batch.warningCount} upozorenja
          </span>
          <span className="text-gray-400">{entries.length} financijskih unosa</span>
          {batch.fileSize && (
            <span className="text-gray-400 ml-auto">{(batch.fileSize / 1024).toFixed(1)} KB</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['financije', 'resursi', 'issues'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-blue-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t === 'financije' ? `Financije (${entries.length})` : t === 'resursi' ? `Resursi (${resources.length})` : `Poruke (${issues.length})`}
          </button>
        ))}
      </div>

      {/* Financije */}
      {tab === 'financije' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex gap-2 flex-wrap">
            <button onClick={() => setFilter('all')} className={`text-xs px-3 py-1 rounded-full ${filter === 'all' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Sve
            </button>
            {groups.map((g) => (
              <button key={g} onClick={() => setFilter(g)} className={`text-xs px-3 py-1 rounded-full ${filter === g ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {GROUP_LABELS[g] ?? g}
              </button>
            ))}
          </div>
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${e.valueType === 'realizirano' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
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
      )}

      {/* Resursi */}
      {tab === 'resursi' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Data centar</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Resurs</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jedinica</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Instalirano</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Ukupni kapacitet</th>
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
      )}

      {/* Issues */}
      {tab === 'issues' && (
        <div className="space-y-2">
          {issues.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              Nema grešaka ni upozorenja
            </div>
          ) : (
            issues.map((iss) => (
              <div key={iss.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5"><SeverityBadge severity={iss.severity} /></div>
                <div className="flex-1 text-sm">
                  <p className="text-gray-800">{iss.message}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
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
