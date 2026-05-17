import { useTheme } from '../hooks/useTheme'

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { mode, toggleMode } = useTheme()

  const label = mode === 'dark' ? 'Uključi svijetli prikaz' : 'Uključi tamni prikaz'
  const icon  = mode === 'dark' ? '☀' : '☾'

  if (compact) {
    return (
      <button
        onClick={toggleMode}
        title={label}
        aria-label={label}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-white/15"
        style={{ color: 'rgba(255,255,255,0.8)' }}
      >
        {icon}
      </button>
    )
  }

  return (
    <button
      onClick={toggleMode}
      title={label}
      aria-label={label}
      className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl transition-all"
      style={{
        backgroundColor: 'rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.85)',
        border: '1px solid rgba(255,255,255,0.15)',
      }}
    >
      <span style={{ fontSize: '15px' }}>{icon}</span>
      <span>{mode === 'dark' ? 'Svijetlo' : 'Tamno'}</span>
    </button>
  )
}
