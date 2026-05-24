import type { Anomaly, AnomalySeverity } from '../utils/anomalies'

const SEV_STYLE: Record<AnomalySeverity, { bg: string; border: string; text: string; icon: string; label: string }> = {
  critical: { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    icon: '🚨', label: 'Kritično' },
  warning:  { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: '⚠️',  label: 'Upozorenje' },
  info:     { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   icon: 'ℹ️',  label: 'Info' },
}

/**
 * Lista detektiranih nepravilnosti. Prikazuje se grupirano po severity.
 * Ako nema ničega, prikazuje "sve izgleda OK" poruku.
 */
export function AnomaliesPanel({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="text-sm font-medium text-gray-700">Nisu detektirane nepravilnosti</p>
        <p className="text-xs text-gray-400 mt-1">
          Trendovi i razmjeri između kategorija izgledaju očekivano.
        </p>
      </div>
    )
  }

  const grouped: Record<AnomalySeverity, Anomaly[]> = { critical: [], warning: [], info: [] }
  for (const a of anomalies) grouped[a.severity].push(a)

  return (
    <div className="space-y-3">
      {(['critical', 'warning', 'info'] as AnomalySeverity[]).map((sev) => {
        const list = grouped[sev]
        if (list.length === 0) return null
        const s = SEV_STYLE[sev]
        return (
          <div key={sev} className={`bg-white rounded-2xl border ${s.border} overflow-hidden`}>
            <div className={`px-5 py-2.5 border-b ${s.border} ${s.bg} flex items-center gap-2`}>
              <span className="text-base">{s.icon}</span>
              <p className={`text-sm font-semibold ${s.text}`}>
                {s.label} <span className="font-normal opacity-70">({list.length})</span>
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {list.map((a, i) => (
                <div key={i} className="px-5 py-3">
                  <p className="text-sm font-medium text-gray-800">{a.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
