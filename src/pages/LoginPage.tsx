import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/authService'
import { isInitialized } from '../config/firebase'
import { GlagoliticMatrix } from '../components/GlagoliticMatrix'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  if (!isInitialized()) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        <GlagoliticMatrix className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
          <div className="text-4xl mb-3">⚙️</div>
          <h2 className="text-blue-800 font-bold text-lg mb-2">Firebase nije konfiguriran</h2>
          <p className="text-gray-500 text-sm mb-6">Postavite vezu u postavkama.</p>
          <button
            onClick={() => navigate('/settings')}
            className="w-full bg-blue-700 text-white py-3 rounded-xl font-medium hover:bg-blue-800 transition-colors"
          >
            Idi na Postavke
          </button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Pogrešan email ili lozinka')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Matrix glagoljica pozadina */}
      <GlagoliticMatrix className="absolute inset-0 w-full h-full" />

      {/* Tamni overlay za čitljivost kartice */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Login card */}
      <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-blue-800 px-8 py-7 text-center">
          <div className="text-4xl mb-2">📊</div>
          <h1 className="text-white font-bold text-xl tracking-tight">DII IT Ulaganja</h1>
          <p className="text-blue-200 text-sm mt-1">Prijavite se za nastavak</p>
        </div>

        {/* Form */}
        <div className="px-8 py-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ime@tijelo.hr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Lozinka</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 text-sm"
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Prijava...
                  </span>
                : 'Prijavi se'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-400">
            <button onClick={() => navigate('/settings')} className="underline hover:text-gray-600">
              Firebase postavke
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
