import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  getBatch,
  getFinancialEntries,
  getImportIssues,
  getInstalledResources,
  getInstitutions,
  deleteBatch,
  activateBatch,
  addAuditLog,
  linkBatchToInstitution,
  normalizeIssues,
  resolveIssue,
} from '../services/firestoreService'
import { runImport } from '../services/importService'
import { currentUser } from '../services/authService'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { Institution } from '../models/institution'
import { StatusBadge, ActiveBadge, SeverityBadge } from '../components/StatusBadge'
import { exportToExcel, exportToCsv } from '../utils/exportUtils'
import { getAppSettings } from '../hooks/useAppSettings'
import { validateOib, formatOibError } from '../utils/oibValidator'

type Tab = 'financije' | 'resursi' | 'issues'

const GROUP_LABELS: Record<string, string> = {
  CAPEX:      'CAPEX Infrastruktura',
  ODRZAVANJE: 'Održavanje',
  LICENCE:    'Licence i softver',
  OPEX:       'Operativni troškovi',
  CLOUD:      'Cloud troškovi',
}

const TIP_A_FIELDS = ['oib', 'name', 'contactName', 'contactEmail', 'contactPhone']

function formatEur(v: number | null): string {
  if (v === null) return '–'
  return new Intl.NumberFormat('hr-HR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v)
}

// ─── Panel: Poveži instituciju ────────────────────────────────────
interface LinkPanelProps {
  batchId: string
  onLinked: () => void
}

function LinkInstitutionPanel({ batchId, onLinked }: LinkPanelProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => { getInstitutions().then(setInstitutions) }, [])

  const filtered = institutions.filter(i =>
    i.name.toLowerCase().includes(query.toLowerCase()) ||
    i.oib.includes(query)
  )

  async function handleLink() {
    if (!selected) return
    setSaving(true)
    try {
      const user = currentUser()
      if (!user) return
      await linkBatchToInstitution(batchId, selected, user.uid)
      await addAuditLog({
        userId: user.uid,
        action: 'link_institution',
        entityType: 'importBatch',
        entityId: batchId,
        timestamp: new Date(),
        details: { institutionId: selected },
      })
      onLinked()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
      <p className="text-sm font-semibold text-amber-800 mb-3">
        ⚠ Batch nije povezan s institucijom
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Traži instituciju (naziv ili OIB)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
        >
          <option value="">— Odaberi instituciju —</option>
          {filtered.map(i => (
            <option key={i.id} value={i.id!}>
              {i.name} ({i.oib})
            </option>
          ))}
        </select>
        <button
          onClick={handleLink}
          disabled={!selected || saving}
          className="shrink-0 text-sm px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Spreman…' : 'Poveži'}
        </button>
      </div>
    </div>
  )
}

// ─── Modal: Normaliziraj upozorenja ──────────────────────────────
interface NormalizeModalProps {
  batchId: string
  warningCount: number
  onClose: () => void
  onDone: (count: number) => void
}

function NormalizeModal({ batchId, warningCount, onClose, onDone }: NormalizeModalProps) {
  const [running, setRunning] = useState(false)

  async function handleNormalize() {
    setRunning(true)
    try {
      const user = currentUser()
      if (!user) return
      const count = await normalizeIssues([batchId], user.uid)
      await addAuditLog({
        userId: user.uid,
        action: 'bulk_normalize',
        entityType: 'importBatch',
        entityId: batchId,
        timestamp: new Date(),
        details: { normalizedCount: count },
      })
      onDone(count)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-gray-800 mb-2">Normaliziraj upozorenja</h2>
        <p className="text-sm text-gray-600 mb-4">
          Automatski će se razriješiti sva upozorenja čija je originalna vrijednost varijanta
          N/A (------,&nbsp;N/A,&nbsp;n.a.,&nbsp;n/p). Ukupno upozorenja: <strong>{warningCount}</strong>.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={handleNormalize}
            disabled={running}
            className="text-sm px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {running ? 'Normalizacija…' : 'Normaliziraj'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Tip A ispravak (OIB, naziv, kontakt) ──────────────────
interface TipAModalProps {
  issue: ImportIssue
  onClose: () => void
  onSaved: () => void
}

function TipAModal({ issue, onClose, onSaved }: TipAModalProps) {
  const [value, setValue] = useState(issue.correctedValue ?? issue.originalValue ?? '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState('')

  function validate(): boolean {
    if (issue.fieldName === 'oib') {
      const err = formatOibError(value)
      setValidationError(err)
      return !err
    }
    if (!value.trim()) {
      setValidationError('Vrijednost ne može biti prazna')
      return false
    }
    setValidationError('')
    return true
  }

  async function handleSave() {
    if (!validate()) return
    if (!issue.id) return
    setSaving(true)
    try {
      const user = currentUser()
      if (!user) return
      await resolveIssue(issue.id, user.uid, 'MANUAL_EDIT', value.trim(), note.trim() || undefined)
      await addAuditLog({
        userId: user.uid,
        action: 'manual_correction',
        entityType: 'importIssue',
        entityId: issue.id,
        timestamp: new Date(),
        details: { field: issue.fieldName, correctedValue: value.trim() },
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const isOib = issue.fieldName === 'oib'
  const oibValid = isOib ? validateOib(value) : true

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-gray-800 mb-1">Ispravi podatak</h2>
        <p className="text-xs text-gray-400 mb-4">
          {issue.sheetName} · {issue.fieldName}
          {issue.originalValue ? ` · Originalno: "${issue.originalValue}"` : ''}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Ispravljena vrijednost
            </label>
            <input
              type={isOib ? 'text' : 'text'}
              value={value}
              onChange={e => { setValue(e.target.value); setValidationError('') }}
              maxLength={isOib ? 11 : undefined}
              placeholder={isOib ? '11 znamenki' : 'Nova vrijednost…'}
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                validationError ? 'border-red-400' : isOib && value.length === 11
                  ? oibValid ? 'border-green-400' : 'border-red-400'
                  : 'border-gray-200'
              }`}
            />
            {validationError && (
              <p className="text-xs text-red-600 mt-1">{validationError}</p>
            )}
            {isOib && value.length === 11 && !validationError && oibValid && (
              <p className="text-xs text-green-600 mt-1">✓ OIB je validan</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Napomena (neobavezno)
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Razlog ispravka…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm px-4 py-2 rounded-lg btn-primary disabled:opacity-50"
          >
            {saving ? 'Spreman…' : 'Spremi ispravak'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Re-upload zona (Tip B) ───────────────────────────────────────
interface ReuploadZoneProps {
  batch: ImportBatch
  onImported: (newBatchId: string) => void
}

function ReuploadZone({ batch, onImported }: ReuploadZoneProps) {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.match(/\.xlsx?$/i)) {
      setError('Samo .xlsx datoteke su podržane')
      return
    }
    setError('')
    setProgress('Pokrećem import…')
    try {
      const result = await runImport(file, p => setProgress(p.message), true)
      setProgress(null)
      onImported(result.batchId)
    } catch (err) {
      setError(String(err))
      setProgress(null)
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setOpen(true)}
          className="w-full text-sm text-gray-500 border border-dashed border-gray-300 rounded-2xl py-3 hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          ↑ Re-upload novije verzije (Tip B)
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Re-upload — zamjena batcha</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Novi batch će automatski zamijeniti ovaj i postati aktivan za instituciju{' '}
        <strong>{batch.importSummary?.institutionName || '–'}</strong>.
      </p>

      {progress ? (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-4 justify-center">
          <span className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          {progress}
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) handleFile(f)
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <p className="text-3xl mb-2">📁</p>
          <p className="text-sm text-gray-500">Povuci i ispusti .xlsx datoteku ili klikni za odabir</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

// ─── Glavna stranica ──────────────────────────────────────────────
export function ImportDetailPage() {
  usePageTitle('Detalji uvoza')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [resources, setResources] = useState<InstalledResource[]>([])
  const [tab, setTab] = useState<Tab>('financije')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [activating, setActivating] = useState(false)
  const [showNormalize, setShowNormalize] = useState(false)
  const [tipAIssue, setTipAIssue] = useState<ImportIssue | null>(null)

  async function reload() {
    if (!id) return
    const [b, e, iss, res] = await Promise.all([
      getBatch(id), getFinancialEntries(id), getImportIssues(id), getInstalledResources(id),
    ])
    setBatch(b); setEntries(e); setIssues(iss); setResources(res)
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }
  if (!batch) return <div className="text-red-600 text-sm p-4 bg-red-50 rounded-xl">Batch nije pronađen</div>

  async function handleDelete() {
    if (!id) return
    setDeleteStep('deleting')
    try {
      await deleteBatch(id)
      navigate('/upload?tab=batches', { replace: true })
    } catch {
      setDeleteStep('idle')
    }
  }

  async function handleActivate() {
    if (!id || !batch?.institutionId) return
    setActivating(true)
    try {
      await activateBatch(id, batch.institutionId)
      const user = currentUser()
      if (user) {
        await addAuditLog({
          userId: user.uid,
          action: 'set_active_batch',
          entityType: 'importBatch',
          entityId: id,
          timestamp: new Date(),
          details: { institutionId: batch.institutionId },
        })
      }
      await reload()
    } finally {
      setActivating(false)
    }
  }

  const groups = [...new Set(entries.map((e) => e.categoryGroup))]
  const filteredEntries = filter === 'all' ? entries : entries.filter((e) => e.categoryGroup === filter)

  const unresolvedWarnings = issues.filter(i => i.severity === 'warning' && !i.resolvedAt)

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'financije', label: 'Financije',  count: entries.length },
    { key: 'resursi',   label: 'Resursi',    count: resources.length },
    { key: 'issues',    label: 'Poruke',     count: issues.length },
  ]

  return (
    <div>
      <Link to="/imports" className="inline-flex items-center gap-1 text-sm p-tx hover:underline mb-4">
        ← Batch-evi
      </Link>

      {/* ── Panel: Poveži instituciju ── */}
      {!batch.institutionId && (
        <LinkInstitutionPanel batchId={id!} onLinked={reload} />
      )}

      {/* ── Header kartica ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">{batch.fileName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch.importSummary?.institutionName || '–'} · {batch.uploadedAt.toLocaleDateString('hr-HR')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ActiveBadge isActive={batch.isActive} />
            <StatusBadge status={batch.processingStatus} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
          <span className={batch.errorCount > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
            {batch.errorCount} grešaka
          </span>
          <span className={batch.warningCount > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
            {batch.warningCount} upozorenja
          </span>
          <span className="text-gray-400">{entries.length} financijskih unosa</span>
          {batch.fileSize != null && (
            <span className="text-gray-400">{(batch.fileSize / 1024).toFixed(1)} KB</span>
          )}

          {/* ── Actions ── */}
          <div className="sm:ml-auto flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
            {unresolvedWarnings.length > 0 && deleteStep === 'idle' && (
              <button
                onClick={() => setShowNormalize(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors"
              >
                ✦ Normaliziraj upozorenja ({unresolvedWarnings.length})
              </button>
            )}
            {!batch.isActive && batch.institutionId && deleteStep === 'idle' && (
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
              >
                {activating ? (
                  <><span className="animate-spin h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full" /> Aktiviranje…</>
                ) : 'Postavi kao aktivan'}
              </button>
            )}
            {deleteStep === 'idle' && (
              <button
                onClick={() => setDeleteStep('confirm')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
              >
                🗑 Ukloni batch
              </button>
            )}
            {deleteStep === 'confirm' && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                <span className="text-xs text-red-700 font-medium">Trajno obriši sve podatke?</span>
                <button
                  onClick={handleDelete}
                  className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
                >
                  Da, obriši
                </button>
                <button
                  onClick={() => setDeleteStep('idle')}
                  className="text-xs px-3 py-1 rounded-lg bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                >
                  Odustani
                </button>
              </div>
            )}
            {deleteStep === 'deleting' && (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <span className="animate-spin h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full" />
                Brisanje…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Re-upload zona (Tip B) ── */}
      {batch.institutionId && (
        <ReuploadZone
          batch={batch}
          onImported={(newId) => navigate(`/imports/${newId}`)}
        />
      )}

      {/* ── Tabovi ── */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === key
                ? 'act-bg act-tx'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
            <span
              className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
              style={tab === key
                ? { backgroundColor: 'rgba(0,0,0,0.2)', color: 'white' }
                : { backgroundColor: 'var(--s-rz)', color: 'var(--t3)' }}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Financije ── */}
      {tab === 'financije' && (
        <>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {(['all', ...groups] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setFilter(g)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${
                    filter === g ? 'act-bg act-tx' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {g === 'all' ? 'Sve' : GROUP_LABELS[g] ?? g}
                </button>
              ))}
            </div>
            {filteredEntries.length > 0 && (() => {
              const defExport = getAppSettings().defaultExport
              const baseName  = batch.fileName.replace(/\.[^.]+$/, '')
              return (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => exportToExcel(filteredEntries, `${baseName}-financije.xlsx`)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      defExport === 'xlsx' ? 'btn-primary' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>⬇</span> Excel
                  </button>
                  <button
                    onClick={() => exportToCsv(filteredEntries, `${baseName}-financije.csv`)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      defExport === 'csv' ? 'btn-primary' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>⬇</span> CSV
                  </button>
                </div>
              )
            })()}
          </div>

          <div className="sm:hidden space-y-2">
            {filteredEntries.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-800 leading-tight">{e.categoryName}</p>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                    e.valueType === 'realizirano' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                  }`}>
                    {e.valueType}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-2">{GROUP_LABELS[e.categoryGroup] ?? e.categoryGroup} · {e.year}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{formatEur(e.normalizedValue)}</span>
                  {e.note && <span className="text-xs text-gray-400 italic">{e.note}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Kategorija</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Grupa</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Godina</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Vrsta</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Iznos (EUR)</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Napomena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800">{e.categoryName}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{GROUP_LABELS[e.categoryGroup] ?? e.categoryGroup}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{e.year}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.valueType === 'realizirano' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}>
                          {e.valueType}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">{formatEur(e.normalizedValue)}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{e.note || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Resursi ── */}
      {tab === 'resursi' && (
        <>
          <div className="sm:hidden space-y-2">
            {resources.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <p className="text-xs text-blue-600 font-medium mb-0.5">{r.dataCenterName}</p>
                <p className="text-sm font-semibold text-gray-800 mb-2">{r.resourceName}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div>
                    <span className="block text-gray-400">Instalirano</span>
                    <span className="font-mono font-medium text-gray-700">
                      {r.installedValue !== '' ? String(r.installedValue) : '–'} {r.unit}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400">Kapacitet</span>
                    <span className="font-mono font-medium text-gray-700">
                      {r.totalCapacity !== '' ? String(r.totalCapacity) : '–'}
                    </span>
                  </div>
                </div>
                {r.note && <p className="text-xs text-gray-400 mt-2 italic">{r.note}</p>}
              </div>
            ))}
          </div>

          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Data centar</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Resurs</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jedinica</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Instalirano</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Kapacitet</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Napomena</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resources.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600 text-xs">{r.dataCenterName}</td>
                    <td className="px-4 py-2 text-gray-800 font-medium">{r.resourceName}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{r.unit}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.installedValue !== '' ? String(r.installedValue) : '–'}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.totalCapacity !== '' ? String(r.totalCapacity) : '–'}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{r.note || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Issues ── */}
      {tab === 'issues' && (
        <div className="space-y-2">
          {issues.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400">
              <p className="text-3xl mb-2">✅</p>
              <p>Nema grešaka ni upozorenja</p>
            </div>
          ) : (
            issues.map((iss) => {
              const canFixTipA = iss.sheetName === 'Opći podaci' && TIP_A_FIELDS.includes(iss.fieldName)
              const isResolved = !!iss.resolvedAt
              return (
                <div
                  key={iss.id}
                  className={`bg-white rounded-xl border p-3 sm:p-4 flex items-start gap-3 ${
                    isResolved ? 'border-green-100 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <div className="mt-0.5 shrink-0"><SeverityBadge severity={iss.severity} /></div>
                  <div className="flex-1 min-w-0 text-sm">
                    <p className={isResolved ? 'text-gray-400 line-through' : 'text-gray-800'}>
                      {iss.message}
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5 truncate">
                      {iss.sheetName} · {iss.rowLabel} · {iss.fieldName}
                      {iss.originalValue ? ` · "${iss.originalValue}"` : ''}
                    </p>
                    {isResolved && (
                      <p className="text-xs text-green-600 mt-0.5">
                        ✓ Riješeno · {iss.resolvedMethod}
                        {iss.correctedValue ? ` → "${iss.correctedValue}"` : ''}
                        {iss.resolutionNote ? ` · ${iss.resolutionNote}` : ''}
                      </p>
                    )}
                  </div>
                  {canFixTipA && !isResolved && (
                    <button
                      onClick={() => setTipAIssue(iss)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      Ispravi
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Modali ── */}
      {showNormalize && (
        <NormalizeModal
          batchId={id!}
          warningCount={unresolvedWarnings.length}
          onClose={() => setShowNormalize(false)}
          onDone={async (count) => {
            setShowNormalize(false)
            await reload()
            console.info(`Normalizirano ${count} upozorenja`)
          }}
        />
      )}

      {tipAIssue && (
        <TipAModal
          issue={tipAIssue}
          onClose={() => setTipAIssue(null)}
          onSaved={async () => {
            setTipAIssue(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}
