import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBatches } from '../services/firestoreService'
import type { ImportBatch } from '../models/importBatch'
import { StatusBadge } from '../components/StatusBadge'

export function ImportsPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getBatches()
      .then(setBatches)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500 text-sm">Učitavam...</div>
  if (error) return <div className="text-red-600 text-sm">{error}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Import batch-evi</h1>
        <Link
          to="/upload"
          className="bg-blue-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors"
        >
          + Novi uvoz
        </Link>
      </div>

      {batches.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-3xl mb-2">📭</p>
          <p>Nema uvezenih batch-eva</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Datoteka</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Institucija</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Datum</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Greške</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Upozorenja</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{b.fileName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {b.importSummary?.institutionName || '–'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {b.uploadedAt.toLocaleDateString('hr-HR')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.processingStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.errorCount > 0 ? (
                      <span className="text-red-600 font-medium">{b.errorCount}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.warningCount > 0 ? (
                      <span className="text-yellow-600 font-medium">{b.warningCount}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/imports/${b.id}`}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      Detalji →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
