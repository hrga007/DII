import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../services/authService'
import { useToast } from '../hooks/useToast'
import { ThemeSwitcher } from './ThemeSwitcher'
import type { User } from 'firebase/auth'

interface Props {
  user: User
  children: React.ReactNode
}

const NAV = [
  { to: '/',             label: 'Dashboard',  icon: '📊' },
  { to: '/upload',       label: 'Uvoz',       icon: '📂' },
  { to: '/institutions', label: 'Institucije', icon: '🏛️' },
  { to: '/settings',     label: 'Postavke',   icon: '⚙️' },
]

export function Layout({ user, children }: Props) {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { showToast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    setMenuOpen(false)
    await logout()
    showToast('Uspješno ste se odjavili', 'info')
    navigate('/login')
  }

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/'
    if (to === '/upload') return location.pathname.startsWith('/upload') || location.pathname.startsWith('/imports')
    return location.pathname.startsWith(to)
  }

  return (
    <div className="min-h-screen flex flex-col pg-bg">

      {/* ── Header ────────────────────────────────────── */}
      <header className="hdr-bg text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="font-bold text-base sm:text-lg tracking-tight" style={{ color: 'white' }}>
              DII IT Ulaganja
            </span>
            <span className="text-xs hidden sm:block" style={{ color: 'rgba(255,255,255,0.45)' }}>MVP</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 mx-4">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(to)
                    ? 'act-bg act-tx'
                    : 'hover:bg-white/10'
                }`}
                style={isActive(to) ? {} : { color: 'rgba(255,255,255,0.75)' }}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Desktop right: theme + user */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeSwitcher compact />
            <div className="flex items-center gap-2 border-l pl-3" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.75)' }}
              >
                Odjava
              </button>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => setMenuOpen(true)}
            aria-label="Otvori izbornik"
          >
            <span className="block w-5 h-0.5 bg-white rounded" />
            <span className="block w-5 h-0.5 bg-white rounded" />
            <span className="block w-5 h-0.5 bg-white rounded" />
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ─────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 flex flex-col animate-slide-in card-bg" style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.3)' }}>

            {/* Drawer header */}
            <div className="hdr-bg px-5 py-4 flex items-center justify-between">
              <span className="font-bold" style={{ color: 'white' }}>Izbornik</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-2xl leading-none hover:opacity-70 transition-opacity"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              >
                ×
              </button>
            </div>

            {/* User info */}
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--bd)' }}>
              <p className="text-xs" style={{ color: 'var(--t3)' }}>Prijavljeni kao</p>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--t1)' }}>{user.email}</p>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV.map(({ to, label, icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={
                    isActive(to)
                      ? { backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }
                      : { color: 'var(--t2)' }
                  }
                  onMouseEnter={e => { if (!isActive(to)) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--s-rz)' }}
                  onMouseLeave={e => { if (!isActive(to)) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                >
                  <span className="text-base">{icon}</span>
                  {label}
                </Link>
              ))}
            </nav>

            {/* Theme switcher u draweru */}
            <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--bd)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--t3)' }}>Tema</p>
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--s-rz)' }}>
                <ThemeSwitcher compact />
              </div>
            </div>

            {/* Logout */}
            <div className="px-5 py-4">
              <button
                onClick={handleLogout}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--s-rz)', color: 'var(--t2)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bd)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--s-rz)')}
              >
                Odjava
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page content ──────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-5 sm:py-6">
        {children}
      </main>
    </div>
  )
}
