import { useState, useRef, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { runImport, type ImportProgress, type ImportResult } from '../services/importService'
import { useToast } from '../hooks/useToast'

type Phase = 'idle' | 'running' | 'done' | 'error'

const STEPS: { key: string; label: string }[] = [
  { key: 'hash',             label: 'Računam hash...' },
  { key: 'duplicate_check',  label: 'Provjera duplikata...' },
  { key: 'parse',            label: 'Parsiram Excel...' },
  { key: 'validate',         label: 'Validacija podataka...' },
  { key: 'save',             label: 'Spreman u Firestore...' },
  { key: 'done',             label: 'Završeno!' },
]

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { showToast } = useToast()

  function handleFileSelect(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      showToast('Prihvaćaju se samo .xlsx i .xls datoteke', 'warning')
      return
    }
    setFile(f)
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelect(f)
  }

  async function handleImport() {
    if (!file) return
    setPhase('running')
    setErrorMsg('')
    try {
      const res = await runImport(file, (p) => setProgress(p))
      setResult(res)
      setPhase('done')
      showToast(
        `Import završen: ${res.financialEntriesCount} unosa${res.errorCount > 0 ? `, ${res.errorCount} grešaka` : ''}`,
        res.errorCount > 0 ? 'warning' : 'success'
      )
    } catch (err) {
      setErrorMsg(String(err))
      setPhase('error')
      showToast('Import nije uspio', 'error')
    }
  }

  const currentStepIdx = STEPS.findIndex((s) => s.key === progress?.step)

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-5">Uvoz Excel datoteke</h1>

      {/* ── Drop zona ── */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => phase !== 'running' && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-colors ${
          phase === 'running'
            ? 'border-blue-300 bg-blue-50 cursor-default'
            : dragging
            ? 'border-blue-500 bg-blue-50 cursor-copy'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        />
        {file ? (
          <div>
            <div className="text-4xl mb-3">📄</div>
            <p className="font-semibold text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            {phase === 'idle' && (
              <p className="text-xs text-blue-500 mt-2">Klikni za promjenu datoteke</p>
            )}
          </div>
        ) : (
          <div>
            <div className="text-5xl mb-4">📂</div>
            <p className="text-gray-700 font-semibold text-base">Povuci i ispusti ovdje</p>
            <p className="text-sm text-gray-400 mt-1">ili klikni za odabir datoteke</p>
            <p className="text-xs text-gray-400 mt-3 bg-gray-100 inline-block px-3 py-1 rounded-full">
              .xlsx · .xls
            </p>
          </div>
        )}
      </div>

      {/* ── Progress stepper ── */}
      {phase === 'running' && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full shrink-0" />
            <span className="text-sm font-medium text-blue-800">{progress?.message}</span>
          </div>
          <div className="space-y-1.5">
            {STEPS.filter((s) => s.key !== 'done').map((s, i) => {
              const done = i < currentStepIdx
              const active = i === currentStepIdx
              return (
                <div key={s.key} className={`flex items-center gap-2 text-xs ${
                  done ? 'text-green-600' : active ? 'text-blue-700 font-medium' : 'text-gray-300'
                }`}>
                  <span className="w-4 text-center">{done ? '✓' : active ? '●' : '○'}</span>
                  {s.label}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Greška ── */}
      {phase === 'error' && errorMsg && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <span className="text-base shrink-0">⚠️</span>
          {errorMsg}
        </div>
      )}

      {/* ── Rezultat ── */}
      {phase === 'done' && result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">✅</span>
            <p className="font-semibold text-green-800">Import uspješno završen!</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: 'Institucija', value: result.institutionName || '–', color: '' },
              { label: 'Financ. unosi', value: result.financialEntriesCount, color: '' },
              { label: 'Greške', value: result.errorCount, color: result.errorCount > 0 ? 'text-red-600' : '' },
              { label: 'Upozorenja', value: result.warningCount, color: result.warningCount > 0 ? 'text-yellow-600' : '' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl p-3 border border-green-100">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className={`font-semibold text-sm ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/imports/${result.batchId}`)}
              className="flex-1 bg-green-700 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-800 transition-colors"
            >
              Prikaži detalje
            </button>
            <button
              onClick={() => { setFile(null); setPhase('idle'); setResult(null) }}
              className="px-4 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Novi uvoz
            </button>
          </div>
        </div>
      )}

      {/* ── Import gumb ── */}
      {file && phase === 'idle' && (
        <button
          onClick={handleImport}
          className="mt-4 w-full bg-blue-700 text-white py-4 rounded-2xl font-semibold text-base hover:bg-blue-800 active:bg-blue-900 transition-colors"
        >
          Pokreni uvoz
        </button>
      )}
    </div>
  )
}
