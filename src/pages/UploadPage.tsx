import { useState, useRef, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { runImport, type ImportProgress, type ImportResult } from '../services/importService'

type Phase = 'idle' | 'running' | 'done' | 'error'

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  function handleFileSelect(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setErrorMsg('Prihvaćaju se samo .xlsx i .xls datoteke')
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
    } catch (err) {
      setErrorMsg(String(err))
      setPhase('error')
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Uvoz Excel datoteke</h1>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        />
        <div className="text-4xl mb-3">📂</div>
        {file ? (
          <div>
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 font-medium">Povuci i ispusti ili klikni za odabir</p>
            <p className="text-sm text-gray-400 mt-1">Prihvaća .xlsx i .xls datoteke</p>
          </div>
        )}
      </div>

      {/* Progress */}
      {phase === 'running' && progress && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
            <span className="text-sm text-blue-800">{progress.message}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {(phase === 'error' || errorMsg) && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Result */}
      {phase === 'done' && result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-green-800">Import uspješno završen!</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white rounded p-2 border border-green-100">
              <span className="text-gray-500">Institucija</span>
              <p className="font-medium">{result.institutionName || '–'}</p>
            </div>
            <div className="bg-white rounded p-2 border border-green-100">
              <span className="text-gray-500">Financijski unosi</span>
              <p className="font-medium">{result.financialEntriesCount}</p>
            </div>
            <div className="bg-white rounded p-2 border border-green-100">
              <span className="text-gray-500">Greške</span>
              <p className={`font-medium ${result.errorCount > 0 ? 'text-red-600' : ''}`}>
                {result.errorCount}
              </p>
            </div>
            <div className="bg-white rounded p-2 border border-green-100">
              <span className="text-gray-500">Upozorenja</span>
              <p className={`font-medium ${result.warningCount > 0 ? 'text-yellow-600' : ''}`}>
                {result.warningCount}
              </p>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => navigate(`/imports/${result.batchId}`)}
              className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800"
            >
              Prikaži detalje
            </button>
            <button
              onClick={() => { setFile(null); setPhase('idle'); setResult(null) }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              Novi uvoz
            </button>
          </div>
        </div>
      )}

      {/* Import button */}
      {file && phase === 'idle' && (
        <button
          onClick={handleImport}
          className="mt-4 w-full bg-blue-700 text-white py-3 rounded-xl font-medium hover:bg-blue-800 transition-colors"
        >
          Pokreni uvoz
        </button>
      )}
    </div>
  )
}
