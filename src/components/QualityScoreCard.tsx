import { useState } from 'react'
import { gradeColor, type QualityResult } from '../utils/dataQuality'

/**
 * Kartica s ocjenom kvalitete podataka.
 * Klikom se proširi i pokaže detaljnu listu faktora.
 */
export function QualityScoreCard({ result }: { result: QualityResult }) {
  const [expanded, setExpanded] = useState(false)
  const colors = gradeColor(result.grade)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`shrink-0 w-14 h-14 rounded-xl ${colors.bg} ${colors.text} ${colors.ring} ring-2 flex flex-col items-center justify-center`}>
          <span className="text-2xl font-bold leading-none">{result.grade}</span>
          <span className="text-[10px] font-medium mt-0.5">{result.score}/100</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Ocjena kvalitete podataka</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {result.factors.filter(f => f.passed).length} / {result.factors.length} faktora zadovoljeno
          </p>
        </div>
        <span className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {result.factors.map((f, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                f.passed
                  ? 'bg-emerald-100 text-emerald-700'
                  : f.points > 0
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {f.passed ? '✓' : f.points > 0 ? '~' : '✗'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-gray-700">{f.label}</p>
                  <span className="text-xs text-gray-400 shrink-0">{f.points} / {f.max}</span>
                </div>
                {f.hint && (
                  <p className="text-xs text-gray-500 mt-0.5">{f.hint}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
