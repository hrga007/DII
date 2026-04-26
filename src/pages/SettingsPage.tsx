import { useState, type FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  saveConfig,
  loadConfig,
  clearConfig,
  initFirebase,
  isInitialized,
  type FirebaseConfig,
} from '../config/firebase'

const FIELDS: { key: keyof FirebaseConfig; label: string; placeholder: string }[] = [
  { key: 'apiKey', label: 'API Key', placeholder: 'AIzaSy...' },
  { key: 'authDomain', label: 'Auth Domain', placeholder: 'project.firebaseapp.com' },
  { key: 'projectId', label: 'Project ID', placeholder: 'my-project' },
  { key: 'storageBucket', label: 'Storage Bucket', placeholder: 'my-project.appspot.com' },
  { key: 'messagingSenderId', label: 'Messaging Sender ID', placeholder: '123456789' },
  { key: 'appId', label: 'App ID', placeholder: '1:123456789:web:abc123' },
]

const EMPTY: FirebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
}

export function SettingsPage() {
  const [config, setConfig] = useState<FirebaseConfig>(EMPTY)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const saved = loadConfig()
    if (saved) setConfig(saved)
    if (isInitialized()) setStatus('ok')
  }, [])

  function handleChange(key: keyof FirebaseConfig, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setStatus('idle')
  }

  async function handleConnect(e: FormEvent) {
    e.preventDefault()
    const missing = FIELDS.filter((f) => !config[f.key].trim())
    if (missing.length > 0) {
      setErrorMsg(`Nedostaju polja: ${missing.map((f) => f.label).join(', ')}`)
      setStatus('error')
      return
    }
    setStatus('connecting')
    setErrorMsg('')
    try {
      await initFirebase(config)
      saveConfig(config)
      setStatus('ok')
    } catch (err) {
      setErrorMsg(String(err))
      setStatus('error')
    }
  }

  function handleReset() {
    clearConfig()
    setConfig(EMPTY)
    setStatus('idle')
    setErrorMsg('')
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Firebase Postavke</h1>
        {status === 'ok' && (
          <span className="bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full">
            Povezano
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleConnect} className="space-y-4">
          {FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="text"
                value={config[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          {status === 'error' && errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}
          {status === 'ok' && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2">
              Firebase uspješno inicijaliziran.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={status === 'connecting'}
              className="flex-1 bg-blue-700 text-white py-2 rounded-lg font-medium hover:bg-blue-800 transition-colors disabled:opacity-60"
            >
              {status === 'connecting' ? 'Povezivanje...' : 'Poveži'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Reset veze
            </button>
          </div>
        </form>
      </div>

      {status === 'ok' && (
        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-blue-700 hover:underline"
          >
            Idi na prijavu →
          </button>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Konfiguracija se sprema lokalno u preglednik (localStorage). Nije prikladna za
        produkcijsko okruženje.
      </p>
    </div>
  )
}
