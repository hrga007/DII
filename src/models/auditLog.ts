export type AuditAction =
  | 'login'
  | 'logout'
  | 'upload'
  | 'import_complete'
  | 'import_failed'
  | 'delete_batch'
  | 'set_active_batch'
  | 'supersede_batch'
  | 'manual_correction'
  | 'link_institution'
  | 'bulk_normalize'
  | 'reupload'

export interface AuditLog {
  id?: string
  userId: string
  action: AuditAction
  entityType: string
  entityId: string
  timestamp: Date
  details: Record<string, unknown>
}
