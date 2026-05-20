import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProvider } from '../providers'
import { currentUser } from '../services/authService'
import type { ImportBatch } from '../models/importBatch'
import { StatusBadge, ActiveBadge } from '../components/StatusBadge'

export function ImportsPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [activating, setActivating] = useState<string | null>(null)

  useEffect(() => {
    getProvider().getBatches()
      .then(setBatches)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleActivate(b: ImportBatch) {
    if (!b.id || !b.institutionId) return
    setActivating(b.id)
    try {
      await getProvider().activateBatch(b.id, b.institutionId)
      const user = currentUser()
      if (user) {
        await getProvider().addAuditLog({
          userId: user.uid,
          action: 'set_active_batch',
          entityType: 'importBatch',
          entityId: b.id,
          timestamp: new Date(),
          details: { institutionId: b.institutionId },
        })
      }
      const updated = await getProvider().getBatches()
      setBatches(updated)
    } finally {
      setActivating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 spin-primary rounded-full" />
      </div>
    )
  }
  if (error) return <div className="text-red-600 text-sm p-4 bg-red-50 rounded-xl">{error}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">Import batch-evi</h1>
        <Link
          to="/upload"
          className="btn-primary text-sm px-4 py-2 rounded-lg"
        >
          + Novi uvoz
        </Link>
      </div>

      {batches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">Nema uvezenih batch-eva</p>
        </div>
      ) : (
        <>
          {/* Mobilni prikaz: kartice */}
          <div className="sm:hidden space-y-3">
            {batches.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-gray-800 text-sm leading-tight">{b.fileName}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ActiveBadge isActive={b.isActive} />
                    <StatusBadge status={b.processingStatus} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-1">
                  {b.importSummary?.institutionName || '–'} · {b.uploadedAt.toLocaleDateString('hr-HR')}
                </p>
                <p className="text-xs mb-3">
                  {b.isActive
                    ? <span className="text-emerald-600 font-medium">↑ Ulazi u izvješće</span>
                    : <span className="text-gray-400">Ne ulazi u izvješće</span>
                  }
                </p>
                <div className="flex flex-wrap gap-3 text-xs items-center">
                  {b.errorCount > 0 ? (
                    <span className="flex items-center gap-1 text-red-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{b.errorCount} grešaka
                    </span>
                  ) : (
                    <span className="text-gray-400">0 grešaka</span>
                  )}
                  {b.warningCount > 0 ? (
                    <span className="flex items-center gap-1 text-yellow-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />{b.warningCount} upozorenja
                    </span>
                  ) : (
                    <span className="text-gray-400">0 upozorenja</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {!b.isActive && b.institutionId && (
                      <button
                        onClick={(e) => { e.preventDefault(); handleActivate(b) }}
                        disabled={activating === b.id}
                        className="text-xs px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                      >
                        {activating === b.id ? '...' : 'Postavi kao aktivan'}
                      </button>
                    )}
                    <Link to={`/imports/${b.id}`} className="p-tx font-medium">Detalji →</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop prikaz: tablica */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Datoteka</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Institucija</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Datum</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Izvješće</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Greške</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Upozorenja</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{b.fileName}</td>
                    <td className="px-4 py-3 text-gray-600">{b.importSummary?.institutionName || '–'}</td>
                    <td className="px-4 py-3 text-gray-500">{b.uploadedAt.toLocaleDateString('hr-HR')}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.processingStatus} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <ActiveBadge isActive={b.isActive} />
                        {b.isActive
                          ? <span className="text-xs text-emerald-600 font-medium">↑ ulazi u izvješće</span>
                          : <span className="text-xs text-gray-400">ne ulazi u izvješće</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.errorCount > 0
                        ? <span className="text-red-600 font-medium">{b.errorCount}</span>
                        : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.warningCount > 0
                        ? <span className="text-yellow-600 font-medium">{b.warningCount}</span>
                        : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {!b.isActive && b.institutionId && (
                          <button
                            onClick={() => handleActivate(b)}
                            disabled={activating === b.id}
                            className="text-xs px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {activating === b.id ? '...' : 'Postavi kao aktivan'}
                          </button>
                        )}
                        <Link to={`/imports/${b.id}`} className="p-tx hover:underline text-xs font-medium whitespace-nowrap">
                          Detalji →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
