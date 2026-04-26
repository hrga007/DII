export type AuditAction =
  | 'login'
  | 'logout'
  | 'upload'
  | 'import_complete'
  | 'import_failed'
  | 'delete_batch'

export interface AuditLog {
  id?: string
  userId: string
  action: AuditAction
  entityType: string
  entityId: string
  timestamp: Date
  details: Record<string, unknown>
}
