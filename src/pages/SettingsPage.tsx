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
import {
  listUsers, createUser, updateRole, removeUser,
  type UserProfile, type Role,
} from '../services/userService'
import { ShareLinksAdmin } from '../components/ShareLinksAdmin'
import { getProvider } from '../providers'

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

const EMPTY_CDU: CduConfig = {
  apiBaseUrl: '',
  gpdbSchema: 'dii_ulaganja',
  s3Bucket: '',
  nifiEndpoint: '',
  catalogUrl: '',
  authMethod: 'jwt-local',
}

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
  label: string; desc?: string; value: string
  onChange: (v: string) => void; placeholder?: string
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

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: 'var(--s-rz)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--t1)' }}>{title}</p>
      {desc && <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{desc}</p>}
    </div>
  )
}

// ── Tab definitions ───────────────────────────────────────────────
type SettingsTab = 'korisnici' | 'share' | 'prikaz' | 'izgled' | 'povezivanje' | 'info'

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'korisnici',   label: 'Korisnici' },
  { key: 'share',       label: 'Podijeljeni linkovi' },
  { key: 'prikaz',      label: 'Prikaz' },
  { key: 'izgled',      label: 'Izgled' },
  { key: 'povezivanje', label: 'Povezivanje' },
  { key: 'info',        label: 'O aplikaciji' },
]

// ─────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const navigate       = useNavigate()
  const hasBuildConfig = getBuildConfig() !== null
  const initialized    = isInitialized()

  const [tab, setTab] = useState<SettingsTab>(initialized ? 'korisnici' : 'povezivanje')

  // Firebase form state
  const [fbConfig, setFbConfig] = useState<FirebaseConfig>(EMPTY_FB)
  const [fbStatus, setFbStatus] = useState<'idle' | 'connecting' | 'ok' | 'error'>('idle')
  const [fbError,  setFbError]  = useState('')

  usePageTitle('Postavke')

  const { mode, toggleMode } = useTheme()
  const { settings, update, reset } = useAppSettings()

  const [backend, setBackend] = useState<BackendSettings>(() => loadBackendSettings())
  const [cduCfg, setCduCfg] = useState<CduConfig>(backend.cdu ?? EMPTY_CDU)
  const [backendSaved, setBackendSaved] = useState(false)
  const [reapplyStatus, setReapplyStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [reapplyResult, setReapplyResult] = useState<{ updated: number; skipped: number } | null>(null)
  const [syncNamesStatus, setSyncNamesStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [syncNamesResult, setSyncNamesResult] = useState<{ updated: number; skipped: number; notFound: number } | null>(null)

  // Korisnici state
  const [users, setUsers] = useState<UserProfile[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<Role>('viewer')
  const [createStatus, setCreateStatus] = useState<'idle' | 'creating' | 'error'>('idle')
  const [createError, setCreateError] = useState('')
  const [updatingUid, setUpdatingUid] = useState<string | null>(null)
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null)
  const [removingUid, setRemovingUid] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')

  async function loadUsers() {
    setUsersLoading(true)
    try {
      setUsers(await listUsers())
      setUsersLoaded(true)
    } finally {
      setUsersLoading(false)
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setCreateStatus('creating'); setCreateError('')
    try {
      await createUser(newEmail.trim(), newPassword, newRole)
      await loadUsers()
      setShowCreateModal(false)
      setNewEmail(''); setNewPassword(''); setNewRole('viewer')
      setCreateStatus('idle')
    } catch (err) {
      setCreateError(String(err).replace('FirebaseError: ', ''))
      setCreateStatus('error')
    }
  }

  async function handleUpdateRole(uid: string, role: Role) {
    setUpdatingUid(uid)
    try {
      await updateRole(uid, role)
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role } : u))
    } finally {
      setUpdatingUid(null)
    }
  }

  async function handleRemoveUser(uid: string) {
    setRemovingUid(uid); setConfirmRemoveUid(null)
    try {
      await removeUser(uid)
      setUsers(prev => prev.filter(u => u.uid !== uid))
    } finally {
      setRemovingUid(null)
    }
  }

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
    setBackend({ kind: 'firebase' })
    setCduCfg(EMPTY_CDU)
    setBackendSaved(false)
  }

  useEffect(() => {
    if (tab === 'korisnici' && !usersLoaded && isInitialized()) {
      loadUsers()
    }
  }, [tab, usersLoaded])

  const fbOk = fbStatus === 'ok'

  return (
    <div>
      <div className="max-w-4xl mx-auto">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>Postavke</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Konfiguracija i upravljanje</p>
          </div>
          {fbOk && (
            <span className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              Firebase OK
            </span>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === key
                  ? 'act-bg act-tx'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════
            TAB: KORISNICI
        ══════════════════════════════════════════════════════ */}
        {tab === 'korisnici' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100" style={{ backgroundColor: 'var(--s-rz)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--t1)' }}>
                    Korisnici
                    {users.length > 0 && <span className="ml-1.5 text-xs font-normal opacity-60">({users.length})</span>}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                    Pregled korisnika i dodjela uloga
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {users.length > 3 && (
                    <input
                      type="text"
                      placeholder="Pretraži email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
                    />
                  )}
                  {isInitialized() && (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="btn-primary text-sm px-4 py-2 rounded-xl font-medium"
                    >
                      + Novi korisnik
                    </button>
                  )}
                </div>
              </div>

              {!isInitialized() ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  Firebase nije spojen. Konfiguriraj vezu na tabu Povezivanje.
                </div>
              ) : usersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin h-6 w-6 border-4 spin-primary rounded-full" />
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-medium text-gray-600 mb-1">Nema korisnika u bazi</p>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                    Dodaj prvog admina. Trenutno prijavljeni korisnik nema Firestore zapis —
                    dodaj ga ručno ili kroz gumb iznad.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {users.filter(u => !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase())).map(u => {
                    const isRemoving = removingUid === u.uid
                    const isConfirm  = confirmRemoveUid === u.uid
                    const isUpdating = updatingUid === u.uid
                    return (
                      <div key={u.uid} className="flex items-center gap-4 px-5 py-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }}
                        >
                          {u.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{u.email}</p>
                          {u.createdAt && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Dodan: {u.createdAt.toLocaleDateString('hr-HR')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isUpdating ? (
                            <span className="animate-spin h-4 w-4 border-2 spin-primary rounded-full" />
                          ) : (
                            <div className="flex gap-1">
                              {(['admin', 'viewer'] as Role[]).map(r => (
                                <button
                                  key={r}
                                  onClick={() => u.role !== r && handleUpdateRole(u.uid, r)}
                                  title={r === 'admin' ? 'Može uređivati, uvoziti i brisati' : 'Može samo pregledavati podatke'}
                                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                    u.role === r
                                      ? 'act-bg act-tx'
                                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                  }`}
                                >
                                  {r === 'admin' ? 'Admin' : 'Viewer'}
                                </button>
                              ))}
                            </div>
                          )}
                          {isRemoving ? (
                            <span className="animate-spin h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full" />
                          ) : isConfirm ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleRemoveUser(u.uid)}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
                              >
                                Obriši
                              </button>
                              <button
                                onClick={() => setConfirmRemoveUid(null)}
                                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                              >
                                Ne
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemoveUid(u.uid)}
                              className="text-gray-300 hover:text-red-500 transition-colors px-1 text-sm"
                              title="Ukloni korisnika"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {usersLoaded && (
                <div className="px-5 py-3 border-t border-gray-50 bg-gray-50 text-xs text-gray-400">
                  Brisanje uklanja Firestore zapis. Korisnik ostaje u Firebase Auth — za potpuno brisanje koristi Firebase konzolu.
                </div>
              )}
            </div>

            {/* Modal: novi korisnik */}
            {showCreateModal && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false) }}
              >
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100" style={{ backgroundColor: 'var(--s-rz)' }}>
                    <p className="font-semibold text-gray-800">Novi korisnik</p>
                  </div>
                  <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        required
                        autoFocus
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        placeholder="korisnik@tijelo.hr"
                        className="p-ring w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Lozinka
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Minimalno 6 znakova"
                        className="p-ring w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Uloga
                      </label>
                      <div className="flex gap-2">
                        {(['admin', 'viewer'] as Role[]).map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setNewRole(r)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border-2 ${
                              newRole === r
                                ? 'border-transparent act-bg act-tx'
                                : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {r === 'admin' ? 'Admin' : 'Viewer'}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        {newRole === 'admin'
                          ? 'Admin može upravljati korisnicima i svim podacima.'
                          : 'Viewer može pregledavati podatke bez izmjena.'}
                      </p>
                    </div>

                    {createStatus === 'error' && createError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                        {createError}
                      </div>
                    )}

                    <div className="flex gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={createStatus === 'creating'}
                        className="btn-primary flex-1 py-2.5 rounded-xl font-medium text-sm"
                      >
                        {createStatus === 'creating' ? 'Kreiranje...' : 'Kreiraj korisnika'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCreateModal(false); setCreateStatus('idle'); setCreateError('') }}
                        className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                      >
                        Odustani
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: SHARE LINKS
        ══════════════════════════════════════════════════════ */}
        {tab === 'share' && <ShareLinksAdmin />}

        {/* ══════════════════════════════════════════════════════
            TAB: PRIKAZ
        ══════════════════════════════════════════════════════ */}
        {tab === 'prikaz' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <SectionHeader title="Postavke prikaza" desc="Prilagodba podataka i formata na dashboardu" />

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
                Excel (.xlsx)
              </PillBtn>
              <PillBtn
                active={settings.defaultExport === 'csv'}
                onClick={() => update('defaultExport', 'csv')}
              >
                CSV (.csv)
              </PillBtn>
            </SettingRow>

            <div className="px-5 py-3 bg-gray-50 text-xs text-gray-400">
              Postavke se automatski spremaju u preglednik (localStorage).
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: IZGLED
        ══════════════════════════════════════════════════════ */}
        {tab === 'izgled' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <SectionHeader title="Način prikaza" desc="Odaberi svjetlu ili tamnu temu" />
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'light' as const, label: 'Svjetlo',  sub: 'Bijela pozadina' },
                    { value: 'dark'  as const, label: 'Tamno',    sub: 'Tamna pozadina' },
                  ] as const).map(({ value, label, sub }) => {
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
            </div>

            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }}
            >
              <span>Promjene se primjenjuju odmah na cijelu aplikaciju.</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: POVEZIVANJE (Firebase + CDU)
        ══════════════════════════════════════════════════════ */}
        {tab === 'povezivanje' && (
          <div className="space-y-4">

            {/* ── Firebase ── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <SectionHeader
                title="Firebase"
                desc="Konfiguracija veze s Firebase projektom"
              />

              {hasBuildConfig ? (
                <div className="p-5">
                  <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
                    <span className="text-green-600 mt-0.5 shrink-0">🔒</span>
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
                <div className="p-5">
                  {!fbOk && (
                    <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-4">
                      <span className="text-yellow-600 mt-0.5 shrink-0">⚠️</span>
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
                <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 text-center">
                  <button onClick={() => navigate('/login')} className="text-sm p-tx hover:underline">
                    Idi na prijavu →
                  </button>
                </div>
              )}
            </div>

            {/* ── CDU Backend ── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <SectionHeader
                title="Backend (CDU)"
                desc="Priprema za migraciju na Centar dijeljenih usluga — trenutno nije aktivno"
              />

              <div className="p-5">
                <div className="flex items-start gap-3 rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: 'var(--p-lt)', color: 'var(--p-tx)' }}>
                  <span className="shrink-0 mt-0.5">ℹ️</span>
                  <p className="text-sm leading-relaxed">
                    Aplikacija je arhitekturalno pripremljena za buduće prebacivanje s Firebase-a
                    na državnu CDU Podatkovnu platformu. Aktivacija CDU backend-a <strong>nije implementirana</strong> —
                    polja ispod služe za buduću konfiguraciju.
                  </p>
                </div>

                <SettingRow
                  label="Aktivni backend"
                  desc="Trenutno se može mijenjati samo Firebase."
                >
                  <PillBtn
                    active={backend.kind === 'firebase'}
                    onClick={() => setBackend({ ...backend, kind: 'firebase' })}
                  >
                    Firebase
                  </PillBtn>
                  <PillBtn
                    active={backend.kind === 'cdu'}
                    onClick={() => setBackend({ ...backend, kind: 'cdu', cdu: cduCfg })}
                  >
                    CDU (uskoro)
                  </PillBtn>
                </SettingRow>
              </div>

              {backend.kind === 'cdu' && (
                <>
                  <CduField
                    label="API URL backend-a"
                    desc="Node.js posrednik instaliran na CDU IaaS"
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
                    desc="Bucket za pohranu uploadanih datoteka"
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
                    desc="Opcionalno — registracija metapodataka"
                    value={cduCfg.catalogUrl ?? ''}
                    onChange={v => setCduCfg({ ...cduCfg, catalogUrl: v })}
                    placeholder="https://catalog.cdu.gov.hr:11480"
                  />

                  <div className="px-5 py-4">
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
                  </div>

                  <div className="px-5 py-3 text-xs border-t border-gray-100" style={{ backgroundColor: 'var(--s-rz)', color: 'var(--t4)' }}>
                    Lozinke i pristupni tokeni se ne unose u UI — backend ih čita iz sigurnog vault-a na CDU IaaS strani.
                  </div>
                </>
              )}
            </div>

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

        {/* ══════════════════════════════════════════════════════
            TAB: O APLIKACIJI
        ══════════════════════════════════════════════════════ */}
        {tab === 'info' && (
          <div className="space-y-4">

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
                      onClick={() => setTab('povezivanje')}
                      className="text-xs p-tx hover:underline mt-0.5"
                    >
                      Konfiguriraj vezu →
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Migracija: retroaktivni ispravci OIB-a i naziva */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">Retroaktivna primjena ispravaka</p>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                Skenira sve ručno riješene greške OIB-a i naziva tijela te primijeni ispravke
                na institucije koje još imaju staru vrijednost. Korisno ako su greške ispravke
                bile riješene prije nadogradnje koja je uvela automatsku propagaciju.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  disabled={reapplyStatus === 'running'}
                  onClick={async () => {
                    setReapplyStatus('running')
                    setReapplyResult(null)
                    try {
                      const result = await getProvider().reapplyResolvedIssues()
                      setReapplyResult(result)
                      setReapplyStatus('done')
                    } catch {
                      setReapplyStatus('error')
                    }
                  }}
                  className="text-sm px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {reapplyStatus === 'running' ? 'Primjenjujem…' : 'Pokreni retroaktivni ispravak'}
                </button>
                {reapplyStatus === 'done' && reapplyResult && (
                  <span className="text-sm text-emerald-700 font-medium">
                    ✓ Ažurirano: {reapplyResult.updated} · Preskočeno: {reapplyResult.skipped}
                  </span>
                )}
                {reapplyStatus === 'error' && (
                  <span className="text-sm text-red-600">Greška pri primjeni — provjeri konzolu</span>
                )}
              </div>
            </div>

            {/* Sinkronizacija naziva iz DII registra */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">Sinkronizacija naziva iz registra</p>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                Za svaku instituciju koja ima OIB, pronalazi odgovarajući unos u pouzdanom DII registru
                (150 tijela) i ispravlja naziv institucije ako se razlikuje. Naziv u registru je mjerodavan.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  disabled={syncNamesStatus === 'running'}
                  onClick={async () => {
                    setSyncNamesStatus('running')
                    setSyncNamesResult(null)
                    try {
                      const result = await getProvider().syncNamesFromRegistry()
                      setSyncNamesResult(result)
                      setSyncNamesStatus('done')
                    } catch {
                      setSyncNamesStatus('error')
                    }
                  }}
                  className="text-sm px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {syncNamesStatus === 'running' ? 'Sinkronizacija…' : 'Sinkroniziraj nazive iz registra'}
                </button>
                {syncNamesStatus === 'done' && syncNamesResult && (
                  <span className="text-sm text-emerald-700 font-medium">
                    ✓ Ažurirano: {syncNamesResult.updated} · Preskočeno: {syncNamesResult.skipped} · Nisu u registru: {syncNamesResult.notFound}
                  </span>
                )}
                {syncNamesStatus === 'error' && (
                  <span className="text-sm text-red-600">Greška pri sinkronizaciji — provjeri konzolu</span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">Lokalne postavke</p>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                Tema i postavke prikaza spremaju se u preglednik.
                Resetiranje ne utječe na Firebase vezu ni na podatke u bazi.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={reset}
                  className="text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Resetiraj postavke prikaza
                </button>
                {!hasBuildConfig && (
                  <button
                    onClick={handleFbReset}
                    className="text-sm px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Obriši Firebase config
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
