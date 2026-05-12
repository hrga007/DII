import type { ProcessingStatus } from '../models/importBatch'

const STATUS_MAP: Record<ProcessingStatus, { label: string; className: string }> = {
  pending: { label: 'Na čekanju', className: 'bg-yellow-100 text-yellow-800' },
  processing: { label: 'Obrađuje se', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Završeno', className: 'bg-green-100 text-green-800' },
  completed_with_warnings: { label: 'Završeno s upozorenjima', className: 'bg-yellow-100 text-yellow-800' },
  completed_with_errors: { label: 'Završeno s greškama', className: 'bg-orange-100 text-orange-800' },
  failed: { label: 'Greška', className: 'bg-red-100 text-red-800' },
  superseded: { label: 'Arhivirano', className: 'bg-gray-100 text-gray-500' },
}

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  const { label, className } = STATUS_MAP[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: 'error' | 'warning' }) {
  return severity === 'error' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
      Greška
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
      Upozorenje
    </span>
  )
}
