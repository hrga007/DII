export type CategoryGroup = 'CAPEX' | 'ODRZAVANJE' | 'LICENCE' | 'OPEX' | 'CLOUD'
export type ValueType = 'realizirano' | 'planirano'

export interface FinancialEntry {
  id?: string
  batchId: string
  institutionId: string
  categoryGroup: CategoryGroup
  categoryName: string
  year: number
  valueType: ValueType
  amount: number | null
  note: string
  sourceSheet: string
  sourceRowIndex: number
  rawValue: string | number | null
  normalizedValue: number | null
  createdAt: Date
}

export type IssueResolutionMethod =
  | 'MANUAL_EDIT'
  | 'REUPLOAD'
  | 'BULK_NORMALIZE'
  | 'LINKED_INSTITUTION'

export interface ImportIssue {
  id?: string
  batchId: string
  severity: 'error' | 'warning'
  sheetName: string
  rowLabel: string
  fieldName: string
  message: string
  originalValue: string
  createdAt: Date
  resolvedAt?: Date
  resolvedBy?: string
  resolvedMethod?: IssueResolutionMethod
  resolutionNote?: string
  correctedValue?: string
}
