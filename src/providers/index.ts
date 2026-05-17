/**
 * Provider registry — odabire koji DataProvider je aktivan.
 *
 * Trenutno uvijek vraća Firebase. CDU opcija je dostupna kao
 * predprema za buduću migraciju, ali aktiviranje će baciti
 * `NotImplementedError` na prvi poziv.
 *
 * Konfiguracija se čita iz localStorage-a (postavlja je
 * Settings → tab "Backend").
 */

import type { DataProvider } from './DataProvider'
import { firebaseProvider } from './firebaseProvider'
import { createCduRestProvider, type CduConfig } from './cduRestProvider'

export type BackendKind = 'firebase' | 'cdu'

export interface BackendSettings {
  kind: BackendKind
  cdu?: CduConfig
}

const LS_KEY = 'dii.backend.settings.v1'

const DEFAULT_SETTINGS: BackendSettings = {
  kind: 'firebase',
}

export function loadBackendSettings(): BackendSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as BackendSettings
    if (parsed.kind !== 'firebase' && parsed.kind !== 'cdu') return DEFAULT_SETTINGS
    return parsed
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveBackendSettings(settings: BackendSettings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(settings))
}

export function clearBackendSettings(): void {
  localStorage.removeItem(LS_KEY)
}

/**
 * Vraća aktivni DataProvider prema spremljenim postavkama.
 * Default: Firebase (sigurna opcija dok god CDU nije spreman).
 */
export function getProvider(): DataProvider {
  const settings = loadBackendSettings()
  if (settings.kind === 'cdu' && settings.cdu) {
    return createCduRestProvider(settings.cdu)
  }
  return firebaseProvider
}

export { firebaseProvider } from './firebaseProvider'
export type { DataProvider } from './DataProvider'
export type { CduConfig } from './cduRestProvider'
