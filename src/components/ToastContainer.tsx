import { useToast } from '../hooks/useToast'

const STYLES = {
  success: 'bg-green-600 text-white',
  error:   'bg-red-600 text-white',
  warning: 'bg-yellow-500 text-white',
  info:    'bg-blue-700 text-white',
}

const ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg animate-fade-in ${STYLES[t.type]}`}
        >
          <span className="text-base font-bold mt-0.5 shrink-0">{ICONS[t.type]}</span>
          <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
