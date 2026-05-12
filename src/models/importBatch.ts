export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'completed_with_warnings'
  | 'completed_with_errors'
  | 'failed'
  | 'superseded'

export interface ImportSummary {
  sheetsProcessed: string[]
  financialEntriesCount: number
  installedResourcesCount: number
  institutionName: string
}

export interface ImportBatch {
  id?: string
  fileName: string
  fileHash: string
  uploadedBy: string
  uploadedAt: Date
  processingStatus: ProcessingStatus
  warningCount: number
  errorCount: number
  fileSize: number
  storagePath: null
  institutionId: string
  templateVersion: string
  importSummary: ImportSummary
  isActive: boolean
  supersedesId?: string
}
