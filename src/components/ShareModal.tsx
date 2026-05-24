import { useState } from 'react'
import { getProvider } from '../providers'
import { currentUser } from '../services/authService'
import { generateShareToken, buildShareUrl } from '../utils/shareToken'
import { EXPIRY_OPTIONS, type ShareLink, type ShareSnapshot, type ShareType } from '../models/shareLink'
import { useToast } from '../hooks/useToast'

interface Props {
  open: boolean
  onClose: () => void
  type: ShareType
  defaultTitle: string
  buildSnapshot: () => ShareSnapshot
}

/**
 * Modal za stvaranje share linka.
 * Korisnik bira rok isteka i dobiva kopirljiv URL.
 */
export function ShareModal({ open, onClose, type, defaultTitle, buildSnapshot }: Props) {
  const { showToast } = useToast()
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [expiryDays, setExpiryDays] = useState<number>(7)
  const [creating, setCreating] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)

  if (!open) return null

  async function handleCreate() {
    const user = currentUser()
    if (!user) {
      showToast('Morate biti prijavljeni', 'error')
      return
    }
    setCreating(true)
    try {
      const token = generateShareToken()
      const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      const link: ShareLink = {
        token,
        type,
        title: title.trim() || defaultTitle,
        description: description.trim() || undefined,
        createdAt: new Date(),
        createdBy: user.uid,
        createdByEmail: user.email ?? undefined,
        expiresAt,
        viewCount: 0,
        lastViewedAt: null,
        snapshot: buildSnapshot(),
      }
      await getProvider().createShareLink(link)
      const url = buildShareUrl(token)
      setCreatedUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        showToast('Link kopiran u međuspremnik', 'success')
      } catch {
        showToast('Link stvoren', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('Greška pri stvaranju linka', 'error')
    } finally {
      setCreating(false)
    }
  }

  function handleClose() {
    setTitle(defaultTitle)
    setDescription('')
    setExpiryDays(7)
    setCreatedUrl(null)
    onClose()
  }

  async function copyAgain() {
    if (!createdUrl) return
    try {
      await navigator.clipboard.writeText(createdUrl)
      showToast('Kopirano', 'success')
    } catch {
      showToast('Ne mogu kopirati', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <p className="font-semibold text-gray-800">Podijeli izvješće</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Stvara javni link s ugrađenim podacima (snapshot). Vrijedi do isteka roka.
          </p>
        </div>

        {!createdUrl ? (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Naslov</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={defaultTitle}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Opis (opcionalno)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Npr. Mjesečno izvješće za ravnatelja"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vrijedi</label>
              <div className="flex gap-2">
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={opt.days}
                    onClick={() => setExpiryDays(opt.days)}
                    className={`flex-1 text-sm px-3 py-2 rounded-lg font-medium transition-colors ${
                      expiryDays === opt.days
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Nakon roka link prestaje raditi. Možete ga ručno obrisati u Postavkama.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
              >
                Odustani
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 btn-primary py-2 rounded-xl font-medium text-sm disabled:opacity-50"
              >
                {creating ? 'Stvaram...' : 'Stvori link'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
              <span className="text-lg">✓</span>
              <p className="text-sm font-medium">Link stvoren i kopiran</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">URL za dijeljenje</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createdUrl}
                  readOnly
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono bg-gray-50"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={copyAgain}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm whitespace-nowrap"
                >
                  Kopiraj
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Pošaljite ovaj link onome komu je namijenjen. Vrijedi {expiryDays} {expiryDays === 1 ? 'dan' : 'dana'}.
            </p>
            <button
              onClick={handleClose}
              className="w-full btn-primary py-2 rounded-xl font-medium text-sm"
            >
              Gotovo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
