interface Series {
  label: string
  color: string
  points: { x: number; y: number }[]
}

interface Props {
  series: Series[]
  width?: number
  height?: number
  yLabel?: string
  xLabels?: number[]
  fmt?: (v: number) => string
}

/**
 * Pure-SVG linijski grafikon. Bez vanjskih biblioteka.
 * Sve serije moraju imati iste x-vrijednosti (godine).
 */
export function LineChart({
  series,
  width = 600,
  height = 280,
  yLabel,
  xLabels,
  fmt = (v) => v.toLocaleString('hr-HR'),
}: Props) {
  const padding = { top: 20, right: 110, bottom: 32, left: 56 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const allPoints = series.flatMap(s => s.points)
  if (allPoints.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nema podataka</p>
  }

  const xs = xLabels ?? [...new Set(allPoints.map(p => p.x))].sort((a, b) => a - b)
  const yMax = Math.max(...allPoints.map(p => p.y), 1)
  const yMin = 0

  const xScale = (x: number) => {
    const idx = xs.indexOf(x)
    return xs.length === 1 ? innerW / 2 : (idx / (xs.length - 1)) * innerW
  }
  const yScale = (y: number) => innerH - ((y - yMin) / (yMax - yMin)) * innerH

  // 4 grid lines
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    y: innerH * (1 - p),
    label: fmt(yMin + (yMax - yMin) * p),
  }))

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block max-w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${width} ${height}`}>
        {/* Grid */}
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {gridYs.map((g, i) => (
            <g key={i}>
              <line x1={0} x2={innerW} y1={g.y} y2={g.y} stroke="#e5e7eb" strokeWidth={1} strokeDasharray={i === 4 ? '0' : '2 3'} />
              <text x={-8} y={g.y + 3} textAnchor="end" fontSize={10} fill="#9ca3af">{g.label}</text>
            </g>
          ))}

          {/* X axis labels */}
          {xs.map((x) => (
            <text key={x} x={xScale(x)} y={innerH + 16} textAnchor="middle" fontSize={11} fill="#6b7280">
              {x}
            </text>
          ))}

          {/* Y label */}
          {yLabel && (
            <text x={-padding.left + 4} y={-6} fontSize={10} fill="#9ca3af" fontWeight="500">
              {yLabel}
            </text>
          )}

          {/* Lines */}
          {series.map((s) => {
            if (s.points.length === 0) return null
            const sorted = [...s.points].sort((a, b) => a.x - b.x)
            const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y)}`).join(' ')
            return (
              <g key={s.label}>
                <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {sorted.map((p) => (
                  <circle key={p.x} cx={xScale(p.x)} cy={yScale(p.y)} r={3} fill={s.color}>
                    <title>{`${s.label} · ${p.x}: ${fmt(p.y)}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}
        </g>

        {/* Legend (vertical, right side) */}
        <g transform={`translate(${width - padding.right + 12}, ${padding.top})`}>
          {series.map((s, i) => (
            <g key={s.label} transform={`translate(0, ${i * 18})`}>
              <rect width={12} height={3} y={5} fill={s.color} rx={1} />
              <text x={18} y={9} fontSize={11} fill="#374151">{s.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
