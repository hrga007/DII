import type { FinancialEntry, CategoryGroup } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'

export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface Anomaly {
  severity: AnomalySeverity
  category?: CategoryGroup
  year?: number
  /** Kratki naslov koji se prikazuje korisniku */
  title: string
  /** Detaljniji opis "zašto je ovo neobično" */
  detail: string
}

const YOY_WARN_THRESHOLD = 0.5      // ±50% u odnosu na prethodnu godinu
const YOY_CRITICAL_THRESHOLD = 2.0  // ±200%
const PLAN_OVERRUN_WARN = 0.5       // realizirano >50% iznad planiranog
const PLAN_OVERRUN_CRIT = 1.0       // >100% iznad
const SINGLE_CAT_DOMINANT = 0.8     // jedna kategorija nosi >80% troška

/**
 * Detekcija nepravilnosti za jednu instituciju.
 * Vraća listu sumnjivih obrazaca koje vrijedi pregledati.
 *
 * Algoritmi su konzervativni — radije propusti dvije sumnjive nego
 * generira lažne uzbune. Sve granice (50%, 200% itd.) su deklarirane
 * gore i mogu se prilagoditi.
 */
export function detectAnomalies(
  entries: FinancialEntry[],
  resources: InstalledResource[] = [],
): Anomaly[] {
  const anomalies: Anomaly[] = []

  // ── 1. YoY skok / pad po kategorijama ──
  const byCatYear = new Map<CategoryGroup, Map<number, number>>()
  for (const e of entries) {
    if (e.valueType !== 'realizirano') continue
    const m = byCatYear.get(e.categoryGroup) ?? new Map<number, number>()
    m.set(e.year, (m.get(e.year) ?? 0) + (e.amount ?? 0))
    byCatYear.set(e.categoryGroup, m)
  }
  for (const [cat, yearMap] of byCatYear) {
    const years = [...yearMap.keys()].sort()
    for (let i = 1; i < years.length; i++) {
      const prev = yearMap.get(years[i - 1]) ?? 0
      const curr = yearMap.get(years[i]) ?? 0
      if (prev === 0 || curr === 0) continue
      const change = (curr - prev) / Math.abs(prev)
      const abs = Math.abs(change)
      if (abs >= YOY_CRITICAL_THRESHOLD) {
        anomalies.push({
          severity: 'critical',
          category: cat,
          year: years[i],
          title: `${cat}: ${change > 0 ? 'porast' : 'pad'} od ${Math.round(abs * 100)}% u ${years[i]}.`,
          detail: `Prošle godine (${years[i - 1]}.) iznos je bio ${Math.round(prev).toLocaleString('hr-HR')} EUR, a sada ${Math.round(curr).toLocaleString('hr-HR')} EUR. Provjeri je li ovo namjerno.`,
        })
      } else if (abs >= YOY_WARN_THRESHOLD) {
        anomalies.push({
          severity: 'warning',
          category: cat,
          year: years[i],
          title: `${cat}: ${change > 0 ? 'porast' : 'pad'} od ${Math.round(abs * 100)}% u ${years[i]}.`,
          detail: `${years[i - 1]}.: ${Math.round(prev).toLocaleString('hr-HR')} EUR → ${years[i]}.: ${Math.round(curr).toLocaleString('hr-HR')} EUR.`,
        })
      }
    }
  }

  // ── 2. Realizirano znatno iznad planiranog ──
  type RP = { realized: number; planned: number }
  const planVsReal = new Map<string, RP>()
  for (const e of entries) {
    const key = `${e.categoryGroup}-${e.year}`
    const r = planVsReal.get(key) ?? { realized: 0, planned: 0 }
    if (e.valueType === 'realizirano') r.realized += e.amount ?? 0
    if (e.valueType === 'planirano')   r.planned   += e.amount ?? 0
    planVsReal.set(key, r)
  }
  for (const [key, { realized, planned }] of planVsReal) {
    if (planned <= 0 || realized <= 0) continue
    const overrun = (realized - planned) / planned
    if (overrun >= PLAN_OVERRUN_WARN) {
      const [catStr, yearStr] = key.split('-')
      anomalies.push({
        severity: overrun >= PLAN_OVERRUN_CRIT ? 'critical' : 'warning',
        category: catStr as CategoryGroup,
        year: Number(yearStr),
        title: `${catStr}: realizirano ${Math.round(overrun * 100)}% iznad plana u ${yearStr}.`,
        detail: `Planirano: ${Math.round(planned).toLocaleString('hr-HR')} EUR, realizirano: ${Math.round(realized).toLocaleString('hr-HR')} EUR.`,
      })
    }
  }

  // ── 3. Cloud trošak bez cloud resursa ──
  const cloudYears = new Set(
    entries
      .filter(e => e.categoryGroup === 'CLOUD' && e.valueType === 'realizirano' && (e.amount ?? 0) > 0)
      .map(e => e.year)
  )
  if (cloudYears.size > 0) {
    const cloudResources = resources.filter(r =>
      /cloud|aws|azure|gcp|google/i.test(r.dataCenterName) ||
      /cloud|aws|azure|gcp|google/i.test(r.resourceName)
    )
    if (cloudResources.length === 0 && resources.length > 0) {
      anomalies.push({
        severity: 'warning',
        title: 'Cloud troškovi prijavljeni, ali nema instaliranih cloud resursa',
        detail: `Godine s cloud potrošnjom: ${[...cloudYears].sort().join(', ')}. Provjeri jesu li cloud usluge propisno evidentirane u resursima.`,
      })
    }
  }

  // ── 4. Jedna kategorija dominira (možda greška u upisu) ──
  const yearTotals = new Map<number, { total: number; byCat: Map<CategoryGroup, number> }>()
  for (const e of entries) {
    if (e.valueType !== 'realizirano') continue
    const y = yearTotals.get(e.year) ?? { total: 0, byCat: new Map() }
    const amt = e.amount ?? 0
    y.total += amt
    y.byCat.set(e.categoryGroup, (y.byCat.get(e.categoryGroup) ?? 0) + amt)
    yearTotals.set(e.year, y)
  }
  for (const [year, { total, byCat }] of yearTotals) {
    if (total <= 0 || byCat.size <= 1) continue
    for (const [cat, amt] of byCat) {
      if (amt / total >= SINGLE_CAT_DOMINANT) {
        anomalies.push({
          severity: 'info',
          category: cat,
          year,
          title: `${cat} čini ${Math.round((amt / total) * 100)}% ukupnog troška u ${year}.`,
          detail: `Ostale kategorije: ${[...byCat.entries()].filter(([c]) => c !== cat).map(([c, v]) => `${c}: ${Math.round((v / total) * 100)}%`).join(', ')}. Možda fali raspodjela po kategorijama.`,
        })
        break
      }
    }
  }

  // Sortiraj po severity (critical → warning → info)
  const sevOrder: Record<AnomalySeverity, number> = { critical: 0, warning: 1, info: 2 }
  anomalies.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  return anomalies
}
