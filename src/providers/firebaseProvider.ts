/**
 * FirebaseProvider — implementacija DataProvider-a koja koristi
 * postojeći `src/services/firestoreService.ts`.
 *
 * Ovo je samo tanki adapter koji omotava postojeće funkcije.
 * Firestore servis ostaje netaknut — svi pozivi koji ga trenutno
 * koriste izravno rade i dalje identično.
 */

import * as fs from '../services/firestoreService'
import type { DataProvider } from './DataProvider'

export const firebaseProvider: DataProvider = {
  name: 'Firebase Firestore',

  // Institutions
  upsertInstitution: fs.upsertInstitution,
  getInstitutions: fs.getInstitutions,
  getInstitutionById: fs.getInstitutionById,
  updateInstitutionRegistryIndex: fs.updateInstitutionRegistryIndex,

  // Batches
  createBatch: fs.createBatch,
  updateBatch: fs.updateBatch,
  getBatches: fs.getBatches,
  getBatch: fs.getBatch,
  deleteBatch: fs.deleteBatch,
  batchExistsByHash: fs.batchExistsByHash,
  getBatchesByInstitution: fs.getBatchesByInstitution,
  activateBatch: fs.activateBatch,
  supersedeBatch: fs.supersedeBatch,

  // Issues
  saveImportIssues: fs.saveImportIssues,
  getImportIssues: fs.getImportIssues,
  getAllImportIssues: fs.getAllImportIssues,
  getImportIssuesByInstitution: fs.getImportIssuesByInstitution,
  resolveIssue: fs.resolveIssue,
  normalizeIssues: fs.normalizeIssues,
  linkBatchToInstitution: fs.linkBatchToInstitution,

  // Financial Entries
  saveFinancialEntries: fs.saveFinancialEntries,
  getFinancialEntries: fs.getFinancialEntries,
  getAllFinancialEntries: fs.getAllFinancialEntries,
  getFinancialEntriesByInstitution: fs.getFinancialEntriesByInstitution,

  // Installed Resources
  saveInstalledResources: fs.saveInstalledResources,
  getInstalledResources: fs.getInstalledResources,
  getInstalledResourcesByInstitution: fs.getInstalledResourcesByInstitution,

  // Audit
  addAuditLog: fs.addAuditLog,
  getAuditLogs: fs.getAuditLogs,

  // Paginated
  getBatchesPaginated: fs.getBatchesPaginated,

  // Share Links
  createShareLink: fs.createShareLink,
  getShareLinkByToken: fs.getShareLinkByToken,
  listShareLinks: fs.listShareLinks,
  deleteShareLink: fs.deleteShareLink,
  recordShareView: fs.recordShareView,
}
