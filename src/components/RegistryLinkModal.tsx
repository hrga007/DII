import { useState, useMemo } from 'react'
import { SUBMISSION_REGISTRY } from '../data/submissionRegistry'
import { findCandidates, scoreLabel } from '../utils/registryMatcher'

interface Props {
  institutionName: string
  currentRegistryIndex: number | null | undefined
  onConfirm: (registryIndex: number | null) => Promise<void>
  onClose: () => void
}

export function RegistryLinkModal({ institutionName, currentRegistryIndex, onConfirm, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number | null>(currentRegistryIndex ?? null)
  const [saving, setSaving] = useState(false)

  const candidates = useMemo(() => findCandidates(institutionName, 5), [institutionName])

  const allFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SUBMISSION_REGISTRY.map((entry, index) => ({ index, entry }))
    return SUBMISSION_REGISTRY
      .map((entry, index) => ({ index, entry }))
      .filter(({ entry }) =>
        entry.name.toLowerCase().includes(q) || entry.email.toLowerCase().includes(q)
      )
  }, [search])

  async function handleSave() {
    setSaving(true)
    try {
      await onConfirm(selected)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const DELIVERY_COLOR: Record<string, string> = {
    DA:    'bg-emerald-100 text-emerald-700',
    NE:    'bg-red-100 text-red-700',
    DOPIS: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: 'min(90vh, 680px)' }}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Uparivanje s registrom dostave</h2>
            <p className="text-xs text-gray-400 mt-0.5">Institucija: <span className="font-medium text-gray-600">{institutionName}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 text-lg">×</button>
        </div>

        {/* Auto-prijedlozi */}
        {candidates[0]?.score > 0 && (
          <div className="px-5 py-3 border-b border-gray-100 shrink-0">
            <p className="text-xs font-semibold text-gray-500 mb-2">Prijedlozi na temelju naziva</p>
            <div className="space-y-1.5">
              {candidates.filter(c => c.score >= 0.3).map(c => (
                <button
                  key={c.index}
                  onClick={() => setSelected(c.index)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                    selected === c.index
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <span className={`shrink-0 w-2 h-2 rounded-full ${
                    c.entry.delivery === 'DA' ? 'bg-emerald-500' : c.entry.delivery === 'DOPIS' ? 'bg-yellow-400' : 'bg-red-500'
                  }`} />
                  <span className="flex-1 text-sm text-gray-800 truncate">{c.entry.name}</span>
                  <span className="shrink-0 text-xs text-gray-400">{scoreLabel(c.score)}</span>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${DELIVERY_COLOR[c.entry.delivery]}`}>
                    {c.entry.delivery}
                  </span>
                  {selected === c.index && <span className="shrink-0 text-blue-600 text-base">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pretraživanje — sva tijela */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži sva tijela..."
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus={candidates[0]?.score < 0.3}
          />
        </div>

        {/* Lista svih tijela */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          <div className="space-y-1">
            {allFiltered.map(({ index, entry }) => (
              <button
                key={index}
                onClick={() => setSelected(index)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  selected === index
                    ? 'bg-blue-50 border border-blue-400'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <span className={`shrink-0 w-2 h-2 rounded-full ${
                  entry.delivery === 'DA' ? 'bg-emerald-500' : entry.delivery === 'DOPIS' ? 'bg-yellow-400' : 'bg-red-500'
                }`} />
                <span className="flex-1 text-sm text-gray-800 truncate">{entry.name}</span>
                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${DELIVERY_COLOR[entry.delivery]}`}>
                  {entry.delivery}
                </span>
                {selected === index && <span className="text-blue-600">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Ukloni uparivanje
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Odustani
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Sprema…' : selected !== null ? 'Potvrdi uparivanje' : 'Spremi bez uparivanja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
