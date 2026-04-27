import { useState } from 'react'

export interface AppSettings {
  topCategoriesCount: number         // 5 | 10 | 15 | 20
  defaultYear:        number | 'all' // initial year filter on dashboard
  defaultExport:      'xlsx' | 'csv' // default export format
}

const DEFAULTS: AppSettings = {
  topCategoriesCount: 10,
  defaultYear:        'all',
  defaultExport:      'xlsx',
}

const KEY = 'app-settings'

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* corrupt JSON */ }
  return { ...DEFAULTS }
}

/** One-shot read outside React (safe to call at module/component init time) */
export function getAppSettings(): AppSettings {
  return load()
}

/** Reactive hook — changes persist to localStorage immediately */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(load)

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }

  function reset() {
    localStorage.removeItem(KEY)
    setSettings({ ...DEFAULTS })
  }

  return { settings, update, reset, DEFAULTS }
}
