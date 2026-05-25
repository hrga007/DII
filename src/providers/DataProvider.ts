/**
 * DataProvider — apstraktni ugovor između aplikacije i baze podataka.
 *
 * Trenutno koristi Firebase Firestore (firebaseProvider).
 * U budućnosti će se moći zamijeniti s CDU (cduRestProvider) bez
 * promjene koda po komponentama.
 *
 * NAPOMENA: Ova datoteka samo opisuje oblik. Aplikacija trenutno
 * još uvijek izravno koristi `src/services/firestoreService.ts`.
 * Migracija call-sitea na `getProvider()` planira se u zasebnoj fazi
 * (vidi CDU_MIGRATION.md).
 */

export interface PaginationParams {
  page: number      // 0-indexed
  pageSize: number
}
export interface PaginatedResult<T> {
  items: T[]
  total: number
  hasMore: boolean
}

import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry, ImportIssue, IssueResolutionMethod } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { AuditLog } from '../models/auditLog'
import type { ShareLink } from '../models/shareLink'

export interface DataProvider {
  /** Naziv implementacije (za debug/UI prikaz). */
  readonly name: string

  // ─── Institutions ──────────────────────────────────────────────
  upsertInstitution(inst: Institution): Promise<string>
  getInstitutions(): Promise<Institution[]>
  getInstitutionById(id: string): Promise<Institution | null>
  updateInstitutionRegistryIndex(institutionId: string, registryIndex: number | null): Promise<void>
  bulkAutoMatchRegistryIndex(): Promise<{ matched: number; skipped: number; alreadyLinked: number }>

  // ─── Import Batches ────────────────────────────────────────────
  createBatch(batch: ImportBatch): Promise<string>
  updateBatch(id: string, data: Partial<ImportBatch>): Promise<void>
  getBatches(): Promise<ImportBatch[]>
  getBatch(id: string): Promise<ImportBatch | null>
  deleteBatch(id: string): Promise<void>
  batchExistsByHash(fileHash: string): Promise<string | null>
  getBatchesByInstitution(institutionId: string): Promise<ImportBatch[]>
  activateBatch(batchId: string, institutionId: string): Promise<void>
  supersedeBatch(oldBatchId: string, newBatchId: string, institutionId: string): Promise<void>

  // ─── Import Issues ─────────────────────────────────────────────
  saveImportIssues(issues: ImportIssue[]): Promise<void>
  getImportIssues(batchId: string): Promise<ImportIssue[]>
  getAllImportIssues(severity?: 'error' | 'warning'): Promise<ImportIssue[]>
  getImportIssuesByInstitution(institutionId: string): Promise<ImportIssue[]>
  resolveIssue(
    issueId: string,
    resolvedBy: string,
    resolvedMethod: IssueResolutionMethod,
    correctedValue?: string,
    resolutionNote?: string,
  ): Promise<void>
  normalizeIssues(batchIds: string[], resolvedBy: string): Promise<number>
  linkBatchToInstitution(batchId: string, institutionId: string, resolvedBy: string): Promise<void>

  // ─── Financial Entries ─────────────────────────────────────────
  saveFinancialEntries(entries: FinancialEntry[]): Promise<void>
  getFinancialEntries(batchId: string): Promise<FinancialEntry[]>
  getAllFinancialEntries(): Promise<FinancialEntry[]>
  getFinancialEntriesByInstitution(institutionId: string): Promise<FinancialEntry[]>

  // ─── Installed Resources ───────────────────────────────────────
  saveInstalledResources(resources: InstalledResource[]): Promise<void>
  getInstalledResources(batchId: string): Promise<InstalledResource[]>
  getInstalledResourcesByInstitution(institutionId: string): Promise<InstalledResource[]>

  // ─── Audit Logs ────────────────────────────────────────────────
  addAuditLog(log: AuditLog): Promise<void>
  getAuditLogs(limitCount?: number): Promise<AuditLog[]>

  // ─── Paginated ─────────────────────────────────────────────────
  getBatchesPaginated(params: PaginationParams): Promise<PaginatedResult<ImportBatch>>

  // ─── Share Links ───────────────────────────────────────────────
  createShareLink(link: ShareLink): Promise<string>
  getShareLinkByToken(token: string): Promise<ShareLink | null>
  listShareLinks(): Promise<ShareLink[]>
  deleteShareLink(id: string): Promise<void>
  recordShareView(id: string): Promise<void>
}
