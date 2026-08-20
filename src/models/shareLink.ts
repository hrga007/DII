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
  /**
   * Klasifikacija institucija iz službenog Popisa tijela javne vlasti.
   *
   * Sprema se uz snapshot kako javni link ne bi ovisio o naknadnim
   * promjenama registra. Opcionalno je radi kompatibilnosti sa starim
   * podijeljenim izvješćima.
   */
  institutionClassifications?: Record<string, ShareInstitutionClassification>
  /**
   * Verzija službenog registra iz koje je izvedena spremljena klasifikacija.
   *
   * Opcionalno je radi kompatibilnosti sa snapshotima nastalima prije nego što
   * su se metapodaci izvora spremali uz javnu poveznicu.
   */
  registrySource?: ShareRegistrySource
  /** Snapshot instaliranih resursa (samo za institution share) */
  resources?: InstalledResource[]
}

export interface ShareInstitutionClassification {
  pravniStatus: string
  djelatnost: string
  osnivac: string
  registryMatched?: boolean
}

export interface ShareRegistrySource {
  url: string
  updatedAt: string | null
  recordCount: number
}

export interface ShareFilters {
  year?: number | 'all'
  categories?: CategoryGroup[]
  valueType?: 'realizirano' | 'planirano' | 'oba'
  institutionId?: string         // za institution share
  /** Odabrane službene klasifikacije; izostanak znači "sve". */
  pravniStatusi?: string[]
  djelatnosti?: string[]
  osnivaci?: string[]
}

export const EXPIRY_OPTIONS = [
  { label: '1 dan',  days: 1 },
  { label: '7 dana', days: 7 },
  { label: '30 dana', days: 30 },
] as const
