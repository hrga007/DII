import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/authService'
import { isInitialized } from '../config/firebase'
import { ThemeSwitcher } from '../components/ThemeSwitcher'

export function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const navigate = useNavigate()

  if (!isInitialized()) {
    return (
      <div className="min-h-screen pg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl card-bg">
          <div className="hdr-bg px-8 py-7 text-center">
            <img
              src="/DII/logo-ministarstvo.png"
              alt="Republika Hrvatska — Ministarstvo pravosuđa, uprave i digitalne transformacije"
              className="h-14 w-auto mx-auto mb-3"
            />
            <h1 className="font-bold text-lg tracking-tight" style={{ color: 'var(--p-hdr)' }}>DII IT Ulaganja</h1>
          </div>
          <div className="p-8 text-center">
            <p className="text-sm mb-6" style={{ color: 'var(--t2)' }}>Aplikacija nije konfigurirana. Postavite Firebase vezu u postavkama.</p>
            <button
              onClick={() => navigate('/settings')}
              className="btn-primary w-full py-3 rounded-xl font-medium"
            >
              Idi na Postavke
            </button>
          </div>
        </div>
        <div className="fixed bottom-6 right-6 z-20">
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
      setError('Pogrešan email ili lozinka. Pokušajte ponovo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen pg-bg flex flex-col">

      {/* Vladino zaglavlje */}
      <header className="hdr-bg shadow-sm" role="banner">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <img
            src="/DII/logo-ministarstvo.png"
            alt="Republika Hrvatska — Ministarstvo pravosuđa, uprave i digitalne transformacije"
            className="h-11 w-auto"
          />
          <ThemeSwitcher compact />
        </div>
      </header>

      {/* Sadržaj */}
      <main id="main-content" className="flex-1 flex items-center justify-center p-4" tabIndex={-1}>
        <div className="w-full max-w-sm">

          {/* Naslov aplikacije */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--p-tx)' }}>
              DII IT Ulaganja
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
              Sustav za praćenje IT ulaganja u državnim institucijama
            </p>
          </div>

          {/* Forma za prijavu */}
          <div className="card-bg rounded-2xl shadow-lg overflow-hidden border" style={{ borderColor: 'var(--bd)' }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-rz)' }}>
              <h2 className="font-semibold text-base" style={{ color: 'var(--t1)' }}>Prijava u sustav</h2>
            </div>

            <div className="px-6 py-6">
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--t2)' }}>
                    Elektronička pošta
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className="p-ring w-full border rounded-xl px-4 py-3 text-sm"
                    style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-rz)', color: 'var(--t1)' }}
                    placeholder="ime@tijelo.hr"
                    aria-required="true"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--t2)' }}>
                    Lozinka
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="p-ring w-full border rounded-xl px-4 py-3 text-sm"
                    style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-rz)', color: 'var(--t1)' }}
                    aria-required="true"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2"
                  >
                    <span aria-hidden="true">⚠</span> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3 rounded-xl font-semibold text-sm"
                >
                  {loading
                    ? <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin h-4 w-4 border-2 spin-primary rounded-full" aria-hidden="true" />
                        Prijava u tijeku...
                      </span>
                    : 'Prijavi se'}
                </button>
              </form>

              <p className="mt-5 text-center text-xs" style={{ color: 'var(--t4)' }}>
                <button
                  onClick={() => navigate('/settings')}
                  className="underline hover:opacity-80 p-tx"
                >
                  Postavke Firebase veze
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer na login stranici */}
      <footer className="border-t py-4 text-center" style={{ borderColor: 'var(--bd)' }}>
        <p className="text-xs" style={{ color: 'var(--t4)' }}>
          Republika Hrvatska · Ministarstvo pravosuđa, uprave i digitalne transformacije
        </p>
      </footer>
    </div>
  )
}
