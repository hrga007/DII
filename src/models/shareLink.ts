import type { FinancialEntry, CategoryGroup } from './financialEntry'
import type { Institution } from './institution'
import type { ImportBatch } from './importBatch'
import type { InstalledResource } from './installedResource'

export type ShareType = 'report' | 'institution'

/**
 * Share link s ugrađenim snapshotom podataka.
 *
 * Pristupa mu se preko `/share/:token` rute koja ne zahtijeva
 * autentifikaciju. Firestore pravila dopuštaju javno čitanje
 * `shareLinks` kolekcije (dok ne istekne) — stvaranje smije samo admin.
 *
 * Snapshot pristup: cijeli sadržaj (filtrirani entries, institucije,
 * resursi) sprema se u dokument pri stvaranju. Nakon toga je "smrznuto" —
 * promjene u glavnoj bazi NE utječu na podijeljenu verziju. To je
 * namjerno: dijelimo specifičan trenutak.
 */
export interface ShareLink {
  id?: string
  token: string                  // URL-safe random
  type: ShareType
  title: string                  // naziv izvješća
  description?: string
  createdAt: Date
  createdBy: string              // userId
  createdByEmail?: string
  expiresAt: Date
  viewCount: number
  lastViewedAt: Date | null
  /** Snapshot podataka — sve što treba za rendering */
  snapshot: ShareSnapshot
}

export interface ShareSnapshot {
  /** Konfiguracija filtera kakva je bila pri stvaranju (informativno) */
  filters: ShareFilters
  /** Snapshot institucija (cijele) ili samo jedna za institution share */
  institutions: Institution[]
  /** Snapshot batch-eva (za institution share — samo aktivni batch) */
  batches?: ImportBatch[]
  /** Snapshot financijskih unosa */
  entries: FinancialEntry[]
  /** Snapshot instaliranih resursa (samo za institution share) */
  resources?: InstalledResource[]
}

export interface ShareFilters {
  year?: number | 'all'
  categories?: CategoryGroup[]
  valueType?: 'realizirano' | 'planirano' | 'oba'
  institutionId?: string         // za institution share
}

export const EXPIRY_OPTIONS = [
  { label: '1 dan',  days: 1 },
  { label: '7 dana', days: 7 },
  { label: '30 dana', days: 30 },
] as const
