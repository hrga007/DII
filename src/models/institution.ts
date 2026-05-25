export interface Institution {
  id?: string
  name: string
  oib: string
  contactName: string
  contactEmail: string
  dcCount: string
  notes?: string
  registryIndex?: number | null
  createdAt: Date
  updatedAt: Date
}
