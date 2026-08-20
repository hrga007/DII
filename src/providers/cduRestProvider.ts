/**
 * CDU REST Provider — stub za buduću integraciju s Centrom dijeljenih
 * usluga (CDU) — državnim oblakom.
 *
 * STANJE: NIJE IMPLEMENTIRANO. Sve metode bacaju `NotImplementedError`.
 * Aktiviranje ovog providera u ovom trenutku će zaustaviti aplikaciju.
 *
 * BUDUĆA ARHITEKTURA:
 *   React (frontend)  ──HTTPS──▶  Naš backend (Node.js na CDU IaaS)
 *                                      │
 *                                      ├──▶  CDU GreenPlum (PostgreSQL)
 *                                      ├──▶  CDU S3 (Hot/Cold)
 *                                      ├──▶  CDU NiFi (ingestion)
 *                                      └──▶  Talend Data Catalog (metapodaci)
 *
 * Vidi: CDU_MIGRATION.md
 */

import type { DataProvider } from './DataProvider'

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`CDU REST Provider: ${method} još nije implementirano.`)
    this.name = 'NotImplementedError'
  }
}

export interface CduConfig {
  /** Bazni URL našeg backenda na CDU IaaS-u. */
  apiBaseUrl: string
  /** Identifikator GPDB schema (npr. "dii_ulaganja"). */
  gpdbSchema?: string
  /** S3 bucket za uploadane datoteke. */
  s3Bucket?: string
  /** Endpoint za NiFi ingestion (opcionalno). */
  nifiEndpoint?: string
  /** Talend Data Catalog URL (opcionalno). */
  catalogUrl?: string
  /** Metoda autentifikacije. */
  authMethod: 'jwt-local' | 'nias'
}

function ni(method: string): never {
  throw new NotImplementedError(method)
}

/**
 * Factory koja vraća CDU provider s danom konfiguracijom.
 * Trenutno svi pozivi bacaju iznimku — služi samo kao kostur
 * koji dokumentira oblik budućeg API-ja.
 */
export function createCduRestProvider(_config: CduConfig): DataProvider {
  void _config
  return {
    name: 'CDU REST (placeholder)',

    upsertInstitution: () => ni('upsertInstitution'),
    getInstitutions: () => ni('getInstitutions'),
    getInstitutionById: () => ni('getInstitutionById'),
    patchInstitution: () => ni('patchInstitution'),

    createBatch: () => ni('createBatch'),
    updateBatch: () => ni('updateBatch'),
    getBatches: () => ni('getBatches'),
    getBatch: () => ni('getBatch'),
    deleteBatch: () => ni('deleteBatch'),
    batchExistsByHash: () => ni('batchExistsByHash'),
    getBatchesByInstitution: () => ni('getBatchesByInstitution'),
    activateBatch: () => ni('activateBatch'),
    supersedeBatch: () => ni('supersedeBatch'),

    saveImportIssues: () => ni('saveImportIssues'),
    getImportIssues: () => ni('getImportIssues'),
    getAllImportIssues: () => ni('getAllImportIssues'),
    getImportIssuesByInstitution: () => ni('getImportIssuesByInstitution'),
    resolveIssue: () => ni('resolveIssue'),
    normalizeIssues: () => ni('normalizeIssues'),
    reapplyResolvedIssues: () => ni('reapplyResolvedIssues'),
    syncNamesFromRegistry: () => ni('syncNamesFromRegistry'),
    linkBatchToInstitution: () => ni('linkBatchToInstitution'),

    saveFinancialEntries: () => ni('saveFinancialEntries'),
    getFinancialEntries: () => ni('getFinancialEntries'),
    getAllFinancialEntries: () => ni('getAllFinancialEntries'),
    getFinancialEntriesByInstitution: () => ni('getFinancialEntriesByInstitution'),

    saveInstalledResources: () => ni('saveInstalledResources'),
    getInstalledResources: () => ni('getInstalledResources'),
    getInstalledResourcesByInstitution: () => ni('getInstalledResourcesByInstitution'),

    addAuditLog: () => ni('addAuditLog'),
    getAuditLogs: () => ni('getAuditLogs'),
    getBatchesPaginated: () => ni('getBatchesPaginated'),

    createShareLink: () => ni('createShareLink'),
    getShareLinkByToken: () => ni('getShareLinkByToken'),
    listShareLinks: () => ni('listShareLinks'),
    deleteShareLink: () => ni('deleteShareLink'),
    recordShareView: () => ni('recordShareView'),
  }
}
