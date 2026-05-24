import { useEffect, useState } from 'react'
import { getProvider } from '../providers'
import { isInitialized } from '../config/firebase'
import { useToast } from '../hooks/useToast'
import { buildShareUrl, isExpired } from '../utils/shareToken'
import type { ShareLink } from '../models/shareLink'

/**
 * Administracija postojećih share linkova.
 * Prikazuje listu, omogućuje kopiranje URL-a i brisanje.
 */
export function ShareLinksAdmin() {
  const { showToast } = useToast()
  const [links, setLinks] = useState<ShareLink[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function load() {
    if (!isInitialized()) return
    setLoading(true)
    try {
      setLinks(await getProvider().listShareLinks())
    } catch {
      showToast('Greška pri učitavanju linkova', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDelete(id: string) {
    setDeletingId(id)
    setConfirmId(null)
    try {
      await getProvider().deleteShareLink(id)
      setLinks((prev) => (prev ?? []).filter(l => l.id !== id))
      showToast('Link obrisan', 'success')
    } catch {
      showToast('Greška pri brisanju', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(buildShareUrl(token))
      showToast('Kopirano', 'success')
    } catch {
      showToast('Ne mogu kopirati', 'error')
    }
  }

  if (!isInitialized()) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        Firebase nije spojen. Konfiguriraj vezu na tabu Povezivanje.
      </div>
    )
  }

  if (loading && !links) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin h-6 w-6 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-sm font-semibold text-gray-700">
          Podijeljeni linkovi {links && <span className="font-normal opacity-60">({links.length})</span>}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Pregled svih aktivnih i isteklih share linkova. Brisanje odmah onemogućuje pristup.
        </p>
      </div>

      {!links || links.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <p className="text-3xl mb-2">🔗</p>
          <p className="text-sm">Nema podijeljenih linkova</p>
          <p className="text-xs mt-1">Stvaraju se gumbom "Podijeli" na stranicama izvješća i institucija.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {links.map((l) => {
            const expired = isExpired(l.expiresAt)
            const isConfirm = confirmId === l.id
            const isDeleting = deletingId === l.id
            return (
              <div key={l.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800 truncate">{l.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      expired ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {expired ? 'Isteklo' : 'Aktivan'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      {l.type === 'institution' ? 'Institucija' : 'Izvješće'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Stvoreno {l.createdAt.toLocaleDateString('hr-HR')}
                    {l.createdByEmail && ` · ${l.createdByEmail}`}
                    {' · '}
                    {expired
                      ? `isteklo ${l.expiresAt.toLocaleDateString('hr-HR')}`
                      : `vrijedi do ${l.expiresAt.toLocaleDateString('hr-HR')}`
                    }
                    {' · '}
                    {l.viewCount} {l.viewCount === 1 ? 'pregled' : 'pregleda'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!expired && (
                    <button
                      onClick={() => handleCopy(l.token)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      title="Kopiraj URL"
                    >
                      Kopiraj
                    </button>
                  )}
                  {isDeleting ? (
                    <span className="animate-spin h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full" />
                  ) : isConfirm ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(l.id!)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium"
                      >
                        Obriši
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500"
                      >
                        Ne
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(l.id!)}
                      className="text-gray-300 hover:text-red-500 transition-colors px-1 text-sm"
                      title="Ukloni"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
