interface Props {
  pct: number | null
  /** Smatraj negativan trend dobrim (npr. troškovi su pali). Default: false. */
  inverted?: boolean
  size?: 'xs' | 'sm'
}

/**
 * Mali chip s % promjenom u odnosu na prethodno razdoblje.
 * Zelena = rast (osim ako inverted), crvena = pad.
 */
export function YoYBadge({ pct, inverted = false, size = 'xs' }: Props) {
  if (pct === null) {
    return <span className="text-xs text-gray-300">—</span>
  }
  const isPositive = pct > 0
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '◆'
  const good = inverted ? !isPositive : isPositive
  const color = pct === 0
    ? 'text-gray-400'
    : good ? 'text-emerald-600' : 'text-red-600'
  const textSize = size === 'sm' ? 'text-xs' : 'text-[10px]'
  const formatted = `${Math.abs(pct) < 0.1 ? 0 : Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`
  return (
    <span className={`${textSize} font-medium ${color} whitespace-nowrap`} title={`Promjena: ${pct.toFixed(1)}%`}>
      {arrow} {formatted}
    </span>
  )
}
