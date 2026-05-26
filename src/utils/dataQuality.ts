import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import type { FinancialEntry } from '../models/financialEntry'
import type { InstalledResource } from '../models/installedResource'
import type { ImportIssue } from '../models/financialEntry'

export interface QualityFactor {
  label: string
  points: number       // dobiveni bodovi
  max: number          // maksimum za ovu kategoriju
  passed: boolean
  hint?: string        // što popraviti ako nije položeno
}

export interface QualityResult {
  score: number        // 0–100
  factors: QualityFactor[]
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

/**
 * Izračunava "ocjenu kvalitete podataka" za jednu instituciju.
 *
 * Ocjena je suma bodova podijeljena s maksimumom, izraženo kao 0–100.
 * Slovo se izvodi iz score-a (A: 90+, B: 75+, C: 60+, D: 40+, F: <40).
 *
 * Faktori su namjerno čitljivi i mogu se proširivati. Težine se mogu
 * mijenjati ovdje na jednom mjestu.
 */
export function computeQualityScore(input: {
  institution: Institution
  batches: ImportBatch[]
  entries: FinancialEntry[]
  resources: InstalledResource[]
  issues: ImportIssue[]
}): QualityResult {
  const { institution, batches, entries, resources, issues } = input

  const factors: QualityFactor[] = []

  // 1. OIB postoji i ima 11 znamenki (10 bodova)
  const hasValidOib = /^\d{11}$/.test(institution.oib)
  factors.push({
    label: 'Valjan OIB',
    points: hasValidOib ? 10 : 0,
    max: 10,
    passed: hasValidOib,
    hint: hasValidOib ? undefined : 'OIB mora imati 11 znamenki',
  })

  // 2. Kontakt informacije (5 bodova)
  const hasContact = Boolean(institution.contactName?.trim() || institution.contactEmail?.trim())
  factors.push({
    label: 'Kontakt informacije',
    points: hasContact ? 5 : 0,
    max: 5,
    passed: hasContact,
    hint: hasContact ? undefined : 'Dodaj ime ili email osobe za kontakt',
  })

  // 3. Postoji barem jedan batch (15 bodova)
  const hasBatch = batches.length > 0
  factors.push({
    label: 'Uvezeni podaci',
    points: hasBatch ? 15 : 0,
    max: 15,
    passed: hasBatch,
    hint: hasBatch ? undefined : 'Institucija još nije uvezla ni jednu Excel datoteku',
  })

  // 4. Aktivan batch postoji (15 bodova) — uvjetuje da uopće ima batch
  const hasActiveBatch = batches.some(b => b.isActive)
  factors.push({
    label: 'Aktivan batch postavljen',
    points: hasActiveBatch ? 15 : (hasBatch ? 0 : 15),
    max: 15,
    passed: hasActiveBatch || !hasBatch,
    hint: hasBatch && !hasActiveBatch
      ? 'Postoje uvozi ali ni jedan nije označen kao aktivan'
      : undefined,
  })

  // 5. Podaci o resursima (10 bodova)
  const hasResources = resources.length > 0
  factors.push({
    label: 'Podaci o resursima',
    points: hasResources ? 10 : 0,
    max: 10,
    passed: hasResources,
    hint: hasResources ? undefined : 'Nema podataka o instaliranoj opremi (DC-ovi, serveri)',
  })

  // 6. Bez neriješenih grešaka (15 bodova)
  const unresolvedErrors = issues.filter(i => i.severity === 'error' && !i.resolvedAt).length
  const noErrors = unresolvedErrors === 0
  factors.push({
    label: 'Nema neriješenih grešaka',
    points: noErrors ? 15 : Math.max(0, 15 - unresolvedErrors * 3),
    max: 15,
    passed: noErrors,
    hint: noErrors ? undefined : `${unresolvedErrors} neriješen${unresolvedErrors === 1 ? 'a greška' : (unresolvedErrors < 5 ? 'e greške' : 'ih grešaka')}`,
  })

  // 7. Bez neriješenih upozorenja (5 bodova)
  const unresolvedWarnings = issues.filter(i => i.severity === 'warning' && !i.resolvedAt).length
  const noWarnings = unresolvedWarnings === 0
  factors.push({
    label: 'Nema neriješenih upozorenja',
    points: noWarnings ? 5 : Math.max(0, 5 - unresolvedWarnings),
    max: 5,
    passed: noWarnings,
    hint: noWarnings ? undefined : `${unresolvedWarnings} neriješeno upozorenje${unresolvedWarnings === 1 ? '' : 'a'}`,
  })

  // 8. Podaci za tekuću godinu (10 bodova)
  const currentYear = new Date().getFullYear()
  const hasCurrentYear = entries.some(e => e.year === currentYear)
  factors.push({
    label: `Podaci za ${currentYear}. godinu`,
    points: hasCurrentYear ? 10 : 0,
    max: 10,
    passed: hasCurrentYear,
    hint: hasCurrentYear ? undefined : `Nema unosa za ${currentYear}.`,
  })

  // 9. Podaci kroz više godina (10 bodova) — uvjet za smislene trendove
  const years = new Set(entries.map(e => e.year))
  const multiYear = years.size >= 2
  factors.push({
    label: 'Podaci kroz više godina',
    points: multiYear ? 10 : (years.size === 1 ? 5 : 0),
    max: 10,
    passed: multiYear,
    hint: multiYear ? undefined : 'Trendovi i usporedbe traže barem 2 godine podataka',
  })

  // 10. Sve uvozi povezani na instituciju (5 bodova)
  const unlinked = batches.filter(b => !b.institutionId).length
  const allLinked = unlinked === 0
  factors.push({
    label: 'Svi uvozi pravilno povezani',
    points: allLinked ? 5 : 0,
    max: 5,
    passed: allLinked,
    hint: allLinked ? undefined : `${unlinked} batch nije povezan s institucijom`,
  })

  const totalPoints = factors.reduce((s, f) => s + f.points, 0)
  const totalMax    = factors.reduce((s, f) => s + f.max, 0)
  const score = Math.round((totalPoints / totalMax) * 100)

  const grade: QualityResult['grade'] =
    score >= 90 ? 'A' :
    score >= 75 ? 'B' :
    score >= 60 ? 'C' :
    score >= 40 ? 'D' : 'F'

  return { score, factors, grade }
}

export function gradeColor(grade: QualityResult['grade']): { bg: string; text: string; ring: string } {
  switch (grade) {
    case 'A': return { bg: 'bg-emerald-50',  text: 'text-emerald-700',  ring: 'ring-emerald-200'  }
    case 'B': return { bg: 'bg-green-50',    text: 'text-green-700',    ring: 'ring-green-200'    }
    case 'C': return { bg: 'bg-yellow-50',   text: 'text-yellow-700',   ring: 'ring-yellow-200'   }
    case 'D': return { bg: 'bg-orange-50',   text: 'text-orange-700',   ring: 'ring-orange-200'   }
    case 'F': return { bg: 'bg-red-50',      text: 'text-red-700',      ring: 'ring-red-200'      }
  }
}
