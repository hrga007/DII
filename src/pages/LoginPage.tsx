import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/authService'
import { isInitialized } from '../config/firebase'
import { GlagoliticMatrix } from '../components/GlagoliticMatrix'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { useTheme } from '../hooks/useTheme'

function LoginCard({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme()
  return (
    <div
      className="relative z-10 w-full max-w-sm rounded-2xl overflow-hidden"
      style={{
        background: mode === 'dark' ? 'rgba(13,17,23,0.96)' : 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(20px)',
        boxShadow: mode === 'dark'
          ? '0 25px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)'
          : '0 25px 60px rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </div>
  )
}

export function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const navigate = useNavigate()
  const { mode }  = useTheme()

  const overlayAlpha = mode === 'dark' ? 0.55 : 0.28

  if (!isInitialized()) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        <GlagoliticMatrix className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${overlayAlpha})` }} />
        <LoginCard>
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">⚙️</div>
            <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--t1)' }}>Firebase nije konfiguriran</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--t3)' }}>Postavite vezu u postavkama.</p>
            <button
              onClick={() => navigate('/settings')}
              className="btn-primary w-full py-3 rounded-xl font-medium"
            >
              Idi na Postavke
            </button>
          </div>
        </LoginCard>
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
          <ThemeSwitcher />
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

      {/* Matrix pozadina */}
      <GlagoliticMatrix className="absolute inset-0 w-full h-full" />
      {/* Overlay */}
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${overlayAlpha})` }} />

      {/* Login kartica */}
      <LoginCard>
        {/* Header kartice */}
        <div className="hdr-bg px-8 py-7 text-center">
          <div className="text-4xl mb-2">📊</div>
          <h1 className="font-bold text-xl tracking-tight" style={{ color: 'white' }}>DII IT Ulaganja</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--p-hd2)' }}>Prijavite se za nastavak</p>
        </div>

        {/* Forma */}
        <div className="px-8 py-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--t2)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="p-ring w-full border rounded-xl px-4 py-3 text-sm"
                style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-rz)', color: 'var(--t1)' }}
                placeholder="ime@tijelo.hr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--t2)' }}>Lozinka</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="p-ring w-full border rounded-xl px-4 py-3 text-sm"
                style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-rz)', color: 'var(--t1)' }}
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
              className="btn-primary w-full py-3 rounded-xl font-semibold text-sm"
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 spin-primary rounded-full" />
                    Prijava...
                  </span>
                : 'Prijavi se'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs" style={{ color: 'var(--t4)' }}>
            <button
              onClick={() => navigate('/settings')}
              className="underline hover:opacity-80 p-tx"
            >
              Firebase postavke
            </button>
          </p>
        </div>
      </LoginCard>

      {/* Floating theme switcher */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
        <ThemeSwitcher />
      </div>
    </div>
  )
}
