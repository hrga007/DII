import { useState, useRef, useCallback, useEffect, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  previewFile, runImport,
  type FilePreview, type ImportProgress, type ImportResult,
} from '../services/importService'
import { getBatches } from '../services/firestoreService'
import { useToast } from '../hooks/useToast'
import { StatusBadge } from '../components/StatusBadge'
import type { ImportBatch } from '../models/importBatch'

// ─── Tipovi redaka ────────────────────────────────────────────────
type ItemStatus = 'previewing' | 'ready' | 'duplicate' | 'importing' | 'done' | 'error'

interface QueueItem {
  uid:      string
  file:     File
  status:   ItemStatus
  preview:  FilePreview | null
  result:   ImportResult | null
  progress: ImportProgress | null
  error:    string
}

// ─── Pomoćne funkcije ─────────────────────────────────────────────
let _uid = 0
const nextUid = () => String(++_uid)

function fmtSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── Status badge boja ────────────────────────────────────────────
const STATUS_STYLE: Record<ItemStatus, { bg: string; text: string; label: string }> = {
  previewing: { bg: 'bg-gray-100',   text: 'text-gray-500',  label: 'Analiza...' },
  ready:      { bg: 'bg-green-100',  text: 'text-green-700', label: 'Spreman' },
  duplicate:  { bg: 'bg-yellow-100', text: 'text-yellow-700',label: 'Duplikat' },
  importing:  { bg: 'bg-blue-100',   text: 'text-blue-700',  label: 'Uvozi se...' },
  done:       { bg: 'bg-green-100',  text: 'text-green-700', label: 'Uvezeno ✓' },
  error:      { bg: 'bg-red-100',    text: 'text-red-700',   label: 'Greška' },
}

// ─── Kartica jedne datoteke u redu ────────────────────────────────
function QueueCard({
  item,
  onImport,
  onForceImport,
  onRemove,
}: {
  item: QueueItem
  onImport:       () => void
  onForceImport:  () => void
  onRemove:       () => void
}) {
  const st = STATUS_STYLE[item.status]
  const { preview } = item

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Zaglavlje kartice */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <span className="text-xl shrink-0">📄</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{item.file.name}</p>
          <p className="text-xs text-gray-400">{fmtSize(item.file.size)}</p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
          {item.status === 'importing' && item.progress
            ? item.progress.message
            : st.label}
        </span>
      </div>

      {/* Tijelo kartice */}
      <div className="px-4 py-3">

        {/* Priprema */}
        {item.status === 'previewing' && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="animate-spin h-4 w-4 border-2 spin-primary rounded-full shrink-0" />
            Čitam informacije o datoteci...
          </div>
        )}

        {/* Greška */}
        {item.status === 'error' && (
          <p className="text-sm text-red-600">{item.error || 'Nepoznata greška'}</p>
        )}

        {/* Uvezeno */}
        {item.status === 'done' && item.result && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-green-700">{item.result.financialEntriesCount}</span> financ. unosa
              {item.result.errorCount > 0 && (
                <span className="ml-2 text-red-600">{item.result.errorCount} grešaka</span>
              )}
            </div>
            <Link
              to={`/imports/${item.result.batchId}`}
              className="text-xs p-tx hover:underline font-medium"
            >
              Detalji →
            </Link>
          </div>
        )}

        {/* Uvozi se — mini progress */}
        {item.status === 'importing' && item.progress && (
          <p className="text-xs text-gray-500">{item.progress.message}</p>
        )}

        {/* Duplikat */}
        {item.status === 'duplicate' && preview && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
              <span className="shrink-0">⚠️</span>
              <div>
                <p className="font-medium">Ova datoteka je već uvezena</p>
                <p className="text-xs text-yellow-600 mt-0.5">
                  Institucija: {preview.institutionName || '–'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={onRemove}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                Ukloni
              </button>
              <button onClick={onForceImport}
                className="text-xs px-3 py-1.5 rounded-lg border btn-primary">
                ↻ Svejedno uvezi
              </button>
            </div>
          </div>
        )}

        {/* Spreman — preview informacije */}
        {item.status === 'ready' && preview && (
          <div className="space-y-2">
            {/* Institucija */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-gray-400 text-xs">Institucija</span>
                <p className="font-semibold text-gray-800">
                  {preview.institutionName || <span className="text-red-500 italic">nije pronađena</span>}
                </p>
              </div>
              {preview.institutionOib && (
                <div>
                  <span className="text-gray-400 text-xs">OIB</span>
                  <p className="font-mono text-gray-700 text-sm">{preview.institutionOib}</p>
                </div>
              )}
            </div>

            {/* Brojevi */}
            <div className="flex gap-3 text-xs text-gray-500">
              <span className="bg-gray-100 px-2 py-1 rounded-lg">
                📊 ~{preview.estimatedEntries} financ. unosa
              </span>
              {preview.estimatedResources > 0 && (
                <span className="bg-gray-100 px-2 py-1 rounded-lg">
                  🖥️ {preview.estimatedResources} resursa
                </span>
              )}
              {preview.missingSheets.length > 0 && (
                <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded-lg">
                  ⚠️ {preview.missingSheets.length} lista nedostaje
                </span>
              )}
            </div>

            {/* Akcije */}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={onRemove}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                Ukloni
              </button>
              <button onClick={onImport}
                className="btn-primary text-xs px-4 py-1.5 rounded-lg font-medium">
                ▶ Uvezi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Glavna stranica ──────────────────────────────────────────────
type Tab = 'upload' | 'batches'

export function UploadPage() {
  const [searchParams] = useSearchParams()
  const [tab,      setTab]      = useState<Tab>(
    searchParams.get('tab') === 'batches' ? 'batches' : 'upload'
  )
  const [queue,    setQueue]    = useState<QueueItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [batches,  setBatches]  = useState<ImportBatch[] | null>(null)
  const [batchLoad, setBatchLoad] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  // Auto-load batch tab if opened via redirect
  useEffect(() => {
    if (tab === 'batches' && batches === null) {
      setBatchLoad(true)
      getBatches().then(setBatches).finally(() => setBatchLoad(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Ažuriranje jednog elementa u redu ──────────────────────────
  const updateItem = useCallback((uid: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(q => q.uid === uid ? { ...q, ...patch } : q))
  }, [])

  // ── Dodaj datoteke u red i odmah preuzmi preview ───────────────
  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const valid = arr.filter(f => f.name.match(/\.(xlsx|xls)$/i))
    if (valid.length < arr.length) {
      showToast('Prihvaćaju se samo .xlsx i .xls datoteke', 'warning')
    }
    if (!valid.length) return

    // Dodaj sve odjednom u red (status: previewing)
    const newItems: QueueItem[] = valid.map(file => ({
      uid: nextUid(), file,
      status: 'previewing', preview: null, result: null, progress: null, error: '',
    }))
    setQueue(prev => [...prev, ...newItems])

    // Pokreni preview za svaku datoteku paralelno
    await Promise.all(newItems.map(async (item) => {
      try {
        const preview = await previewFile(item.file)
        updateItem(item.uid, {
          status:  preview.isDuplicate ? 'duplicate' : 'ready',
          preview,
        })
      } catch (err) {
        updateItem(item.uid, { status: 'error', error: String(err) })
      }
    }))
  }

  // ── Uvezi jednu datoteku ───────────────────────────────────────
  async function importItem(uid: string, file: File, force = false) {
    updateItem(uid, { status: 'importing', progress: null, error: '' })
    try {
      const result = await runImport(file, (p) => updateItem(uid, { progress: p }), force)
      updateItem(uid, { status: 'done', result })
      // Invalidate batch lista
      setBatches(null)
      showToast(
        `${file.name}: ${result.financialEntriesCount} unosa uvezeno`,
        result.errorCount > 0 ? 'warning' : 'success'
      )
    } catch (err) {
      updateItem(uid, { status: 'error', error: String(err) })
      showToast(`${file.name}: uvoz nije uspio`, 'error')
    }
  }

  // ── Uvezi sve spremne ──────────────────────────────────────────
  async function importAll() {
    const ready = queue.filter(q => q.status === 'ready')
    for (const item of ready) {
      await importItem(item.uid, item.file)
    }
  }

  // ── Drag & drop ───────────────────────────────────────────────
  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  // ── Učitaj batch-eve (lazy) ────────────────────────────────────
  async function openBatchesTab() {
    setTab('batches')
    if (batches !== null) return   // već učitano
    setBatchLoad(true)
    try { setBatches(await getBatches()) }
    finally { setBatchLoad(false) }
  }

  const readyCount     = queue.filter(q => q.status === 'ready').length
  const activeCount    = queue.filter(q => !['done'].includes(q.status)).length
  const batchCount     = batches?.length ?? null

  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Tabovi ─────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5">
        <button
          onClick={() => setTab('upload')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            tab === 'upload' ? 'act-bg act-tx' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          📂 Novi uvoz
          {activeCount > 0 && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
              style={tab === 'upload'
                ? { backgroundColor: 'rgba(0,0,0,0.2)', color: 'white' }
                : { backgroundColor: 'var(--s-rz)', color: 'var(--t3)' }}
            >
              {activeCount}
            </span>
          )}
        </button>
        <button
          onClick={openBatchesTab}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            tab === 'batches' ? 'act-bg act-tx' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          📋 Batch-evi
          {batchCount !== null && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
              style={tab === 'batches'
                ? { backgroundColor: 'rgba(0,0,0,0.2)', color: 'white' }
                : { backgroundColor: 'var(--s-rz)', color: 'var(--t3)' }}
            >
              {batchCount}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB: NOVI UVOZ
      ══════════════════════════════════════════════════════════ */}
      {tab === 'upload' && (
        <>
          {/* Drop zona */}
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer border-gray-300"
            style={dragging
              ? { borderColor: 'var(--p)', backgroundColor: 'var(--p-lt)' }
              : {}}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--p-rg)')}
            onMouseLeave={e => { if (!dragging) e.currentTarget.style.borderColor = '' }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={(e) => e.target.files?.length && addFiles(e.target.files)}
            />
            <div className="text-4xl mb-3">📂</div>
            <p className="font-semibold text-gray-700">Povuci datoteke ovdje</p>
            <p className="text-sm text-gray-400 mt-1">ili klikni za odabir — možeš odabrati više datoteka odjednom</p>
            <p className="text-xs text-gray-400 mt-2 bg-gray-100 inline-block px-3 py-1 rounded-full">.xlsx · .xls</p>
          </div>

          {/* Red datoteka */}
          {queue.length > 0 && (
            <div className="mt-4 space-y-3">
              {/* "Uvezi sve" gumb — samo ako ima više od jedne spremne */}
              {readyCount > 1 && (
                <div className="flex justify-end">
                  <button
                    onClick={importAll}
                    className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
                  >
                    ▶▶ Uvezi sve ({readyCount})
                  </button>
                </div>
              )}

              {queue.map(item => (
                <QueueCard
                  key={item.uid}
                  item={item}
                  onImport={() => importItem(item.uid, item.file)}
                  onForceImport={() => importItem(item.uid, item.file, true)}
                  onRemove={() => setQueue(prev => prev.filter(q => q.uid !== item.uid))}
                />
              ))}

              {/* Očisti završene */}
              {queue.some(q => q.status === 'done') && (
                <div className="text-center pt-1">
                  <button
                    onClick={() => setQueue(prev => prev.filter(q => q.status !== 'done'))}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Ukloni završene
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: BATCH-EVI
      ══════════════════════════════════════════════════════════ */}
      {tab === 'batches' && (
        <>
          {batchLoad ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-4 spin-primary rounded-full" />
            </div>
          ) : !batches || batches.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-medium">Nema uvezenih batch-eva</p>
              <button onClick={() => setTab('upload')} className="mt-4 text-sm p-tx hover:underline">
                Uvezi prvu datoteku →
              </button>
            </div>
          ) : (
            <>
              {/* Mobilni prikaz */}
              <div className="sm:hidden space-y-3">
                {batches.map((b) => (
                  <Link key={b.id} to={`/imports/${b.id}`}
                    className="block bg-white rounded-2xl border border-gray-200 p-4 active:bg-gray-50"
                    style={{ textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--p-rg)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-semibold text-gray-800 text-sm leading-tight">{b.fileName}</p>
                      <StatusBadge status={b.processingStatus} />
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      {b.importSummary?.institutionName || '–'} · {b.uploadedAt.toLocaleDateString('hr-HR')}
                    </p>
                    <div className="flex gap-3 text-xs">
                      <span className={b.errorCount > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                        {b.errorCount} grešaka
                      </span>
                      <span className={b.warningCount > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
                        {b.warningCount} upoz.
                      </span>
                      <span className="ml-auto p-tx font-medium">Detalji →</span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Desktop tablica */}
              <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Datoteka</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Institucija</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Datum</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Greške</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unosi</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{b.fileName}</td>
                        <td className="px-4 py-3 text-gray-600">{b.importSummary?.institutionName || '–'}</td>
                        <td className="px-4 py-3 text-gray-500">{b.uploadedAt.toLocaleDateString('hr-HR')}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.processingStatus} /></td>
                        <td className="px-4 py-3 text-right">
                          {b.errorCount > 0
                            ? <span className="text-red-600 font-medium">{b.errorCount}</span>
                            : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {b.importSummary?.financialEntriesCount ?? '–'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/imports/${b.id}`} className="p-tx hover:underline text-xs font-medium">
                            Detalji →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
