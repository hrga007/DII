export interface InstalledResource {
  id?: string
  batchId: string
  institutionId: string
  dataCenterName: string
  resourceName: string
  unit: string
  installedValue: string | number
  totalCapacity: string | number
  note: string
  sourceRowIndex: number
  createdAt: Date
}
