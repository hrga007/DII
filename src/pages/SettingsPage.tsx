import { useState, type FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  saveConfig, loadConfig, clearConfig, initFirebase,
  isInitialized, getBuildConfig, type FirebaseConfig,
} from '../config/firebase'
import { useTheme } from '../hooks/useTheme'
import { useAppSettings } from '../hooks/useAppSettings'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  loadBackendSettings, saveBackendSettings, clearBackendSettings,
  type BackendSettings, type CduConfig,
} from '../providers'

// ── Firebase fields ──────────────────────────────────────────────
const FB_FIELDS: { key: keyof FirebaseConfig; label: string; placeholder: string }[] = [
  { key: 'apiKey',            label: 'API Key',             placeholder: 'AIzaSy...' },
  { key: 'authDomain',        label: 'Auth Domain',         placeholder: 'project.firebaseapp.com' },
  { key: 'projectId',         label: 'Project ID',          placeholder: 'my-project' },
  { key: 'storageBucket',     label: 'Storage Bucket',      placeholder: 'my-project.appspot.com' },
  { key: 'messagingSenderId', label: 'Messaging Sender ID', placeholder: '123456789' },
  { key: 'appId',             label: 'App ID',              placeholder: '1:123456789:web:abc123' },
]

const EMPTY_FB: FirebaseConfig = {
  apiKey: '', authDomain: '', projectId: '',
  storageBucket: '', messagingSenderId: '', appId: '',
}

const YEARS = [2024, 2025, 2026, 2027, 2028]

// ── Shared helpers ────────────────────────────────────────────────
function PillBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'act-bg act-tx'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function CduField({
  label, desc, value, onChange, placeholder,
}: {
  label: string
  desc?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-4 px-5 border-b border-gray-100 last:border-0">
      <div className="sm:w-52 shrink-0 pt-1.5">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="p-ring flex-1 min-w-0 border rounded-xl px-3 py-2 text-sm font-mono"
        style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-rz)', color: 'var(--t1)' }}
      />
    </div>
  )
}

function SettingRow({
  label, desc, children,
}: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-4 px-5 border-b border-gray-100 last:border-0">
      <div className="sm:w-52 shrink-0 pt-0.5">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

// ── Tab definitions ───────────────────────────────────────────────
type SettingsTab = 'firebase' | 'backend' | 'izgled' | 'prikaz' | 'info'

const TABS: { key: SettingsTab; icon: string; label: string }[] = [
  { key: 'firebase', icon: '🔥', label: 'Firebase' },
  { key: 'backend',  icon: '🏛️', label: 'Backend (CDU)' },
  { key: 'izgled',   icon: '🎨', label: 'Izgled' },
  { key: 'prikaz',   icon: '📊', label: 'Prikaz' },
  { key: 'info',     icon: 'ℹ️',  label: 'O aplikaciji' },
]

const EMPTY_CDU: CduConfig = {
  apiBaseUrl: '',
  gpdbSchema: 'dii_ulaganja',
  s3Bucket: '',
  nifiEndpoint: '',
  catalogUrl: '',
  authMethod: 'jwt-local',
}

// ─────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const navigate       = useNavigate()
  const hasBuildConfig = getBuildConfig() !== null
  const initialized    = isInitialized()

  const [tab, setTab] = useState<SettingsTab>('firebase')

  // Firebase form state
  const [fbConfig, setFbConfig] = useState<FirebaseConfig>(EMPTY_FB)
  const [fbStatus, setFbStatus] = useState<'idle' | 'connecting' | 'ok' | 'error'>('idle')
  const [fbError,  setFbError]  = useState('')

  usePageTitle('Postavke')

  // Theme
  const { mode, toggleMode } = useTheme()

  // App display settings
  const { settings, update, reset } = useAppSettings()

  // Backend (CDU) settings
  const [backend, setBackend] = useState<BackendSettings>(() => loadBackendSettings())
  const [cduCfg, setCduCfg] = useState<CduConfig>(backend.cdu ?? EMPTY_CDU)
  const [backendSaved, setBackendSaved] = useState(false)

  useEffect(() => {
    if (!hasBuildConfig) {
      const saved = loadConfig()
      if (saved) setFbConfig(saved)
    }
    if (isInitialized()) setFbStatus('ok')
  }, [hasBuildConfig])

  async function handleConnect(e: FormEvent) {
    e.preventDefault()
    const missing = FB_FIELDS.filter(f => !fbConfig[f.key].trim())
    if (missing.length) {
      setFbError(`Nedostaju polja: ${missing.map(f => f.label).join(', ')}`)
      setFbStatus('error')
      return
    }
    setFbStatus('connecting'); setFbError('')
    try {
      await initFirebase(fbConfig)
      saveConfig(fbConfig)
      setFbStatus('ok')
    } catch (err) {
      setFbError(String(err)); setFbStatus('error')
    }
  }

  function handleFbReset() {
    clearConfig(); setFbConfig(EMPTY_FB); setFbStatus('idle'); setFbError('')
  }

  function handleBackendSave() {
    const next: BackendSettings = backend.kind === 'cdu'
      ? { kind: 'cdu', cdu: cduCfg }
      : { kind: 'firebase' }
    saveBackendSettings(next)
    setBackend(next)
    setBackendSaved(true)
    setTimeout(() => setBackendSaved(false), 2500)
  }

  function handleBackendReset() {
    clearBackendSettings()
    const next: BackendSettings = { kind: 'firebase' }
    setBackend(next)
    setCduCfg(EMPTY_CDU)
    setBackendSaved(false)
  }

  const fbOk = fbStatus === 'ok'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--s-pg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">

        {/* ── Page header ────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {initialized && (
              <button
                onClick={() => navigate(-1)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors text-base"
                title="Nazad"
              >
                ←
              </button>
            )}
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>Postavke</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Konfiguracija i personalizacija</p>
            </div>
          </div>
          {fbOk && (
            <span className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              Firebase OK
            </span>
          )}
        </div>

        {/* ── Tab bar ────────────────────────────────────────── */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {TABS.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === key
                  ? 'act-bg act-tx'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════
            TAB: FIREBASE
        ══════════════════════════════════════════════════════ */}
        {tab === 'firebase' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

            {hasBuildConfig ? (
              /* ── Build-config (read-only) ── */
              <div className="p-6">
                <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5">
                  <span className="text-green-600 mt-0.5">🔒</span>
                  <p className="text-sm text-green-700">
                    Firebase konfiguracija je ugrađena u aplikaciju i automatski se koristi.
                  </p>
                </div>
                <div className="space-y-2">
                  {FB_FIELDS.map(({ key, label }) => {
                    const cfg = getBuildConfig()!
                    return (
                      <div key={key} className="flex items-center gap-3 py-1.5">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-44 shrink-0">
                          {label}
                        </span>
                        <span className="text-xs font-mono text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 truncate flex-1">
                          {key === 'apiKey' ? cfg[key].slice(0, 8) + '••••••••' : cfg[key]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* ── Manual config form ── */
              <div className="p-6">
                {!fbOk && (
                  <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-5">
                    <span className="text-yellow-600 mt-0.5">⚠️</span>
                    <p className="text-sm text-yellow-800">
                      Unesite Firebase konfiguracijske podatke iz Firebase Console → Project Settings.
                    </p>
                  </div>
                )}
                <form onSubmit={handleConnect} className="space-y-3.5">
                  {FB_FIELDS.map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        {label}
                      </label>
                      <input
                        type="text"
                        value={fbConfig[key]}
                        onChange={e => {
                          setFbConfig(prev => ({ ...prev, [key]: e.target.value }))
                          setFbStatus('idle')
                        }}
                        placeholder={placeholder}
                        className="p-ring w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-mono"
                      />
                    </div>
                  ))}

                  {fbStatus === 'error' && fbError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                      {fbError}
                    </div>
                  )}
                  {fbStatus === 'ok' && (
                    <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
                      ✓ Firebase uspješno inicijaliziran.
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={fbStatus === 'connecting'}
                      className="btn-primary flex-1 py-2.5 rounded-xl font-medium text-sm"
                    >
                      {fbStatus === 'connecting' ? 'Povezivanje…' : fbOk ? '✓ Spojeno' : 'Poveži'}
                    </button>
                    <button
                      type="button"
                      onClick={handleFbReset}
                      className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                    >
                      Reset
                    </button>
                  </div>
                </form>
              </div>
            )}

            {fbOk && (
              <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 text-center">
                <button onClick={() => navigate('/login')} className="text-sm p-tx hover:underline">
                  Idi na prijavu →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: IZGLED
        ══════════════════════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════
            TAB: BACKEND (CDU) — priprema za migraciju
        ══════════════════════════════════════════════════════ */}
        {tab === 'backend' && (
          <div className="space-y-4">

            {/* Informativni okvir */}
            <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--p-lt)' }}>
              <div className="flex gap-3">
                <span className="text-xl">🏛️</span>
                <div className="text-sm leading-relaxed" style={{ color: 'var(--p-tx)' }}>
                  <p className="font-semibold mb-1">Priprema za migraciju u CDU (Centar dijeljenih usluga)</p>
                  <p>
                    Aplikacija je arhitekturalno pripremljena za buduće prebacivanje s Firebase-a
                    na državnu CDU Podatkovnu platformu (GreenPlum baza, S3 storage, NiFi ingestion).
                    Aktivacija CDU backend-a trenutno <strong>nije implementirana</strong> — odabir
                    ostaje na Firebase-u. Polja ispod služe za buduću konfiguraciju kad backend
                    bude spreman. Detaljnije: vidi <code>CDU_MIGRATION.md</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Odabir backend-a */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <SettingRow
                label="Aktivni backend"
                desc="Trenutno se može mijenjati samo Firebase. CDU opcija je pripremljena."
              >
                <PillBtn
                  active={backend.kind === 'firebase'}
                  onClick={() => setBackend({ ...backend, kind: 'firebase' })}
                >
                  🔥 Firebase
                </PillBtn>
                <PillBtn
                  active={backend.kind === 'cdu'}
                  onClick={() => setBackend({ ...backend, kind: 'cdu', cdu: cduCfg })}
                >
                  🏛️ CDU (uskoro)
                </PillBtn>
              </SettingRow>
            </div>

            {/* CDU konfiguracija (vidljivo samo ako je odabran CDU) */}
            {backend.kind === 'cdu' && (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: 'var(--s-rz)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--t1)' }}>CDU parametri (priprema)</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                    Tehnički parametri za buduće povezivanje. Ne diraju trenutnu Firebase konekciju.
                  </p>
                </div>

                <CduField
                  label="API URL backend-a"
                  desc="Naš Node.js posrednik koji će biti instaliran na CDU IaaS"
                  value={cduCfg.apiBaseUrl}
                  onChange={v => setCduCfg({ ...cduCfg, apiBaseUrl: v })}
                  placeholder="https://dii-api.cdu.gov.hr"
                />
                <CduField
                  label="GPDB schema"
                  desc="Logička schema u CDU GreenPlum bazi"
                  value={cduCfg.gpdbSchema ?? ''}
                  onChange={v => setCduCfg({ ...cduCfg, gpdbSchema: v })}
                  placeholder="dii_ulaganja"
                />
                <CduField
                  label="S3 bucket"
                  desc="Bucket za pohranu uploadanih datoteka (Excel, PDF)"
                  value={cduCfg.s3Bucket ?? ''}
                  onChange={v => setCduCfg({ ...cduCfg, s3Bucket: v })}
                  placeholder="dii-uploads"
                />
                <CduField
                  label="NiFi endpoint"
                  desc="Opcionalno — za automatski uvoz vanjskih datoteka"
                  value={cduCfg.nifiEndpoint ?? ''}
                  onChange={v => setCduCfg({ ...cduCfg, nifiEndpoint: v })}
                  placeholder="https://nifi.cdu.gov.hr/dii"
                />
                <CduField
                  label="Talend Catalog URL"
                  desc="Opcionalno — registracija metapodataka u podatkovnom katalogu"
                  value={cduCfg.catalogUrl ?? ''}
                  onChange={v => setCduCfg({ ...cduCfg, catalogUrl: v })}
                  placeholder="https://catalog.cdu.gov.hr:11480"
                />

                <SettingRow
                  label="Autentifikacija"
                  desc="NIAS (državni SSO) bit će dostupan u kasnijoj fazi"
                >
                  <PillBtn
                    active={cduCfg.authMethod === 'jwt-local'}
                    onClick={() => setCduCfg({ ...cduCfg, authMethod: 'jwt-local' })}
                  >
                    Lokalni JWT
                  </PillBtn>
                  <PillBtn
                    active={cduCfg.authMethod === 'nias'}
                    onClick={() => setCduCfg({ ...cduCfg, authMethod: 'nias' })}
                  >
                    NIAS (uskoro)
                  </PillBtn>
                </SettingRow>

                <div className="px-5 py-3 text-xs" style={{ backgroundColor: 'var(--s-rz)', color: 'var(--t4)' }}>
                  ⚠️ Lozinke i pristupni tokeni se <strong>ne unose</strong> u UI — backend ih
                  čita iz sigurnog vault-a na CDU IaaS strani.
                </div>
              </div>
            )}

            {/* Akcije */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleBackendSave}
                className="btn-primary px-4 py-2 rounded-xl text-sm font-medium"
              >
                Spremi postavke
              </button>
              <button
                onClick={handleBackendReset}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Vrati zadano (Firebase)
              </button>
              {backendSaved && (
                <span className="text-sm" style={{ color: 'var(--p-tx)' }}>✓ Spremljeno</span>
              )}
            </div>
          </div>
        )}

        {tab === 'izgled' && (
          <div className="space-y-4">

            {/* Mode */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Način prikaza</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'light' as const, icon: '☀️', label: 'Svjetlo',  sub: 'Bijela pozadina' },
                  { value: 'dark'  as const, icon: '🌙', label: 'Tamno',    sub: 'Tamna pozadina' },
                ] as const).map(({ value, icon, label, sub }) => {
                  const active = mode === value
                  return (
                    <button
                      key={value}
                      onClick={() => mode !== value && toggleMode()}
                      className={`relative flex flex-col items-center gap-2 py-5 rounded-xl border-2 transition-all ${
                        active
                          ? 'border-transparent act-bg'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 text-white/80 text-xs">✓</span>
                      )}
                      <span className="text-2xl">{icon}</span>
                      <div className="text-center">
                        <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>
                          {label}
                        </p>
                        <p className={`text-xs mt-0.5 ${active ? 'text-white/60' : 'text-gray-400'}`}>
                          {sub}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Preview hint */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }}
            >
              <span>💡</span>
              <span>Promjene se primjenjuju odmah na cijelu aplikaciju.</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: PRIKAZ
        ══════════════════════════════════════════════════════ */}
        {tab === 'prikaz' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

            <SettingRow
              label="Top kategorija"
              desc="Broj kategorija prikazanih na dashboardu (sortirano po iznosu)"
            >
              {[5, 10, 15, 20].map(n => (
                <PillBtn
                  key={n}
                  active={settings.topCategoriesCount === n}
                  onClick={() => update('topCategoriesCount', n)}
                >
                  {n}
                </PillBtn>
              ))}
            </SettingRow>

            <SettingRow
              label="Zadana godina"
              desc="Početni filter po godini na dashboardu"
            >
              <PillBtn
                active={settings.defaultYear === 'all'}
                onClick={() => update('defaultYear', 'all')}
              >
                Sve
              </PillBtn>
              {YEARS.map(y => (
                <PillBtn
                  key={y}
                  active={settings.defaultYear === y}
                  onClick={() => update('defaultYear', y)}
                >
                  {y}
                </PillBtn>
              ))}
            </SettingRow>

            <SettingRow
              label="Format izvoza"
              desc="Zadani format pri preuzimanju podataka"
            >
              <PillBtn
                active={settings.defaultExport === 'xlsx'}
                onClick={() => update('defaultExport', 'xlsx')}
              >
                📊 Excel (.xlsx)
              </PillBtn>
              <PillBtn
                active={settings.defaultExport === 'csv'}
                onClick={() => update('defaultExport', 'csv')}
              >
                📄 CSV (.csv)
              </PillBtn>
            </SettingRow>

            <div className="px-5 py-3 bg-gray-50 text-xs text-gray-400">
              Postavke se automatski spremaju u preglednik (localStorage).
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: O APLIKACIJI
        ══════════════════════════════════════════════════════ */}
        {tab === 'info' && (
          <div className="space-y-4">

            {/* App identity */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-4 mb-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shrink-0 shadow-md"
                  style={{ backgroundColor: 'var(--p)' }}
                >
                  DII
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-base">DII IT Ulaganja</p>
                  <p className="text-xs text-gray-400 mt-0.5">Verzija 1.0.0 MVP · 2025</p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
                    style={{ backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }}
                  >
                    Interoperabilnost digitalnih infrastruktura
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { k: 'Frontend',        v: 'React 18 + TypeScript' },
                  { k: 'Build tool',      v: 'Vite' },
                  { k: 'Baza podataka',   v: 'Firebase Firestore' },
                  { k: 'Autentikacija',   v: 'Firebase Auth' },
                  { k: 'Stil',            v: 'Tailwind CSS v4' },
                  { k: 'Deployment',      v: 'GitHub Pages' },
                ].map(({ k, v }) => (
                  <div key={k} className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <p className="text-gray-400 mb-0.5">{k}</p>
                    <p className="font-medium text-gray-700">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Firebase status */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Status Firebase veze</p>
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    fbOk ? 'bg-green-500 shadow-[0_0_6px_2px_rgba(34,197,94,0.35)]' : 'bg-gray-300'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {fbOk ? 'Firestore — Spojeno' : 'Firebase — Nije spojeno'}
                  </p>
                  {fbOk && (getBuildConfig()?.projectId || loadConfig()?.projectId) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Projekt: {getBuildConfig()?.projectId ?? loadConfig()?.projectId}
                    </p>
                  )}
                  {!fbOk && (
                    <button
                      onClick={() => setTab('firebase')}
                      className="text-xs p-tx hover:underline mt-0.5"
                    >
                      Konfiguriraj Firebase →
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Local storage info */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">Lokalne postavke</p>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                Tema, paleta boja i postavke prikaza spremaju se u preglednik.
                Resetiranje ne utječe na Firebase vezu ni na podatke u bazi.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={reset}
                  className="text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ↺ Resetiraj postavke prikaza
                </button>
                {!hasBuildConfig && (
                  <button
                    onClick={handleFbReset}
                    className="text-sm px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    🗑 Obriši Firebase config
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
