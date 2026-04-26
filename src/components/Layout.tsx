import { Link, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../services/authService'
import type { User } from 'firebase/auth'

interface Props {
  user: User
  children: React.ReactNode
}

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/upload', label: 'Uvoz' },
  { to: '/imports', label: 'Batch-evi' },
  { to: '/settings', label: 'Postavke' },
]

export function Layout({ user, children }: Props) {
  const location = useLocation()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg tracking-tight">DII IT Ulaganja</span>
            <span className="text-blue-300 text-sm hidden sm:block">MVP</span>
          </div>
          <nav className="flex items-center gap-1">
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
              <span className="text-blue-200 text-xs hidden sm:block">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded transition-colors"
              >
                Odjava
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">{children}</main>
    </div>
  )
}
