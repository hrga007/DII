import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../services/authService'
import { useToast } from '../hooks/useToast'
import type { User } from 'firebase/auth'

interface Props {
  user: User
  children: React.ReactNode
}

const NAV = [
  { to: '/',         label: 'Dashboard', icon: '📊' },
  { to: '/upload',   label: 'Uvoz',      icon: '📂' },
  { to: '/imports',  label: 'Batch-evi', icon: '📋' },
  { to: '/settings', label: 'Postavke',  icon: '⚙️' },
]

export function Layout({ user, children }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    setMenuOpen(false)
    await logout()
    showToast('Uspješno ste se odjavili', 'info')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-blue-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="font-bold text-base sm:text-lg tracking-tight">DII IT Ulaganja</span>
            <span className="text-blue-300 text-xs hidden sm:block">MVP</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === to
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-100 hover:bg-blue-700'
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="ml-4 flex items-center gap-2 border-l border-blue-600 pl-4">
              <span className="text-blue-200 text-xs">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded transition-colors"
              >
                Odjava
              </button>
            </div>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2 rounded hover:bg-blue-700 transition-colors"
            onClick={() => setMenuOpen(true)}
            aria-label="Otvori izbornik"
          >
            <span className="block w-5 h-0.5 bg-white rounded" />
            <span className="block w-5 h-0.5 bg-white rounded" />
            <span className="block w-5 h-0.5 bg-white rounded" />
          </button>
        </div>
      </header>

      {/* ── Mobile drawer overlay ───────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-xl flex flex-col animate-slide-in">
            {/* Drawer header */}
            <div className="bg-blue-800 px-5 py-4 flex items-center justify-between">
              <span className="text-white font-bold">Izbornik</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-white text-2xl leading-none hover:text-blue-200"
              >
                ×
              </button>
            </div>

            {/* User info */}
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400">Prijavljeni kao</p>
              <p className="text-sm font-medium text-gray-700 truncate">{user.email}</p>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV.map(({ to, label, icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    location.pathname === to
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base">{icon}</span>
                  {label}
                </Link>
              ))}
            </nav>

            {/* Logout */}
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="w-full bg-red-50 text-red-600 hover:bg-red-100 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                Odjava
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page content ───────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-5 sm:py-6">
        {children}
      </main>
    </div>
  )
}
