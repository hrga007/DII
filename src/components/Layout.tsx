import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../services/authService'
import { useToast } from '../hooks/useToast'
import { ThemeSwitcher } from './ThemeSwitcher'
import { Footer } from './Footer'
import type { User } from 'firebase/auth'

interface Props {
  user: User
  children: React.ReactNode
}

const NAV = [
  { to: '/',             label: 'Pregled' },
  { to: '/upload',       label: 'Uvoz podataka' },
  { to: '/institutions', label: 'Institucije' },
  { to: '/izvjestaji',   label: 'Izvještaji' },
  { to: '/settings',     label: 'Postavke' },
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

      {/* ── Skip to content (WCAG) ────────────────────────── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:font-medium focus:text-sm"
        style={{ backgroundColor: 'var(--p)', color: '#fff' }}
      >
        Preskoči na sadržaj
      </a>

      {/* ── Header ────────────────────────────────────────── */}
      <header className="hdr-bg shadow-sm sticky top-0 z-30" role="banner">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">

          {/* Logo institucije */}
          <Link to="/" className="flex items-center gap-3 shrink-0" aria-label="Početna stranica — DII IT Ulaganja">
            <img
              src="/DII/logo-ministarstvo.png"
              alt="Republika Hrvatska — Ministarstvo pravosuđa, uprave i digitalne transformacije"
              className="h-11 w-auto"
            />
            <div className="hidden sm:block border-l pl-3" style={{ borderColor: 'var(--bd)' }}>
              <div className="text-xs font-semibold leading-tight" style={{ color: 'var(--t3)' }}>
                DII
              </div>
              <div className="text-sm font-bold leading-tight" style={{ color: 'var(--p-hdr)' }}>
                IT Ulaganja
              </div>
            </div>
          </Link>

          {/* Desktop navigacija */}
          <nav aria-label="Glavna navigacija" className="hidden md:flex items-center gap-0.5 flex-1 mx-4">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                aria-current={isActive(to) ? 'page' : undefined}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={
                  isActive(to)
                    ? { backgroundColor: 'var(--p-hdr)', color: '#fff' }
                    : { color: 'var(--t2)' }
                }
                onMouseEnter={e => { if (!isActive(to)) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--s-rz)' }}
                onMouseLeave={e => { if (!isActive(to)) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Desktop desno: dark/light toggle + korisnik */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeSwitcher compact />
            <div className="flex items-center gap-2 border-l pl-3" style={{ borderColor: 'var(--bd)' }}>
              <span className="text-xs" style={{ color: 'var(--t3)' }}>{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--t2)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--s-rz)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '')}
                aria-label="Odjava iz aplikacije"
              >
                Odjava
              </button>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg transition-colors"
            onClick={() => setMenuOpen(true)}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--s-rz)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '')}
            aria-label="Otvori izbornik"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span className="block w-5 h-0.5 rounded" style={{ backgroundColor: 'var(--p-hdr)' }} aria-hidden="true" />
            <span className="block w-5 h-0.5 rounded" style={{ backgroundColor: 'var(--p-hdr)' }} aria-hidden="true" />
            <span className="block w-5 h-0.5 rounded" style={{ backgroundColor: 'var(--p-hdr)' }} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Izbornik">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-0 h-full w-72 flex flex-col animate-slide-in card-bg" style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.3)' }}>

            {/* Drawer zaglavlje */}
            <div className="hdr-bg px-5 py-4 flex items-center justify-between">
              <span className="font-bold" style={{ color: 'var(--p-hdr)' }}>Izbornik</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-2xl leading-none hover:opacity-70 transition-opacity"
                style={{ color: 'var(--t2)' }}
                aria-label="Zatvori izbornik"
              >
                ×
              </button>
            </div>

            {/* Korisnik */}
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--bd)' }}>
              <p className="text-xs" style={{ color: 'var(--t3)' }}>Prijavljeni kao</p>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--t1)' }}>{user.email}</p>
            </div>

            {/* Nav linkovi */}
            <nav aria-label="Mobilna navigacija" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(to) ? 'page' : undefined}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={
                    isActive(to)
                      ? { backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }
                      : { color: 'var(--t2)' }
                  }
                  onMouseEnter={e => { if (!isActive(to)) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--s-rz)' }}
                  onMouseLeave={e => { if (!isActive(to)) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {/* Dark/light toggle */}
            <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--bd)' }}>
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--s-rz)' }}>
                <ThemeSwitcher compact />
                <span className="text-xs" style={{ color: 'var(--t3)' }}>Promjena prikaza</span>
              </div>
            </div>

            {/* Odjava */}
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

      {/* ── Sadržaj stranice ───────────────────────────────── */}
      <main id="main-content" className="flex-1 max-w-7xl mx-auto w-full px-4 py-5 sm:py-6" tabIndex={-1}>
        {children}
      </main>

      <Footer />
    </div>
  )
}
