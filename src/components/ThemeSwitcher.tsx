import { useTheme, type Palette } from '../hooks/useTheme'

const PALETTES: { key: Palette; color: string; label: string }[] = [
  { key: 'red',    color: '#c41a1a', label: 'Crvena (Matrix)' },
  { key: 'blue',   color: '#1d4ed8', label: 'Plava' },
  { key: 'yellow', color: '#b45309', label: 'Žuta' },
]

/** compact=true → ugrađen u header; compact=false → floating panel na login stranici */
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { mode, palette, toggleMode, setPalette } = useTheme()

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMode}
          title={mode === 'dark' ? 'Uključi svijetlo' : 'Uključi tamno'}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-white/15"
          style={{ color: 'rgba(255,255,255,0.8)' }}
        >
          {mode === 'dark' ? '☀' : '☾'}
        </button>
        <div className="flex items-center gap-1.5">
          {PALETTES.map(({ key, color }) => (
            <button
              key={key}
              onClick={() => setPalette(key)}
              title={PALETTES.find(p => p.key === key)?.label}
              className="w-3.5 h-3.5 rounded-full transition-all duration-200"
              style={{
                backgroundColor: color,
                transform: palette === key ? 'scale(1.5)' : 'scale(1)',
                outline: palette === key ? '2px solid rgba(255,255,255,0.8)' : '2px solid transparent',
                outlineOffset: '1px',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Floating panel na login stranici ──────────────────────────────
  return (
    <div
      className="flex items-center gap-3 px-5 py-3 rounded-2xl"
      style={{
        background: 'rgba(5,5,5,0.75)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Mode toggle */}
      <button
        onClick={toggleMode}
        className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl transition-all"
        style={{
          backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)',
          color: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span style={{ fontSize: '15px' }}>{mode === 'dark' ? '☀' : '☾'}</span>
        <span>{mode === 'dark' ? 'Svijetlo' : 'Tamno'}</span>
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.12)' }} />

      {/* Palette */}
      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Tema</span>
      <div className="flex items-center gap-2.5">
        {PALETTES.map(({ key, color, label }) => (
          <button
            key={key}
            onClick={() => setPalette(key)}
            title={label}
            className="w-6 h-6 rounded-full transition-all duration-200 flex items-center justify-center"
            style={{
              backgroundColor: color,
              transform: palette === key ? 'scale(1.3)' : 'scale(1)',
              boxShadow: palette === key
                ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 12px ${color}`
                : '0 0 0 1px rgba(255,255,255,0.15)',
            }}
          >
            {palette === key && (
              <span style={{ color: '#fff', fontSize: '10px', lineHeight: 1 }}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
