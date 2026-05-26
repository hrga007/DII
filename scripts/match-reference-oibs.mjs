#!/usr/bin/env node
/**
 * Za svako od 150 referentnih tijela (iz Excel-a) pronalazi OIB
 * u registru 5754 javnih tijela (Jaccard po tokeniziranom nazivu).
 *
 * Izlaz: scripts/reference-match-report.txt  (za ručnu provjeru)
 *        src/data/diiRegistry.ts             (finalna lista s OIB-ovima)
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('/home/user/DII/node_modules/xlsx')
const __dirname = dirname(fileURLToPath(import.meta.url))

const EXCEL = '/root/.claude/uploads/feaee95d-6d61-4949-b261-2f72ade981ef/031029e7-Tijela_dostava_podataka.xlsx'
const REGISTRY_JSON = resolve(__dirname, '../public/registar-tijela.json')
const REPORT_OUT = resolve(__dirname, 'reference-match-report.txt')
const TS_OUT = resolve(__dirname, '../src/data/diiRegistry.ts')

// ── Tokenizacija i Jaccard ───────────────────────────────────────────────────
const STOP = new Set(['d', 'o', 'dd', 'doo', 'd.o.o', 'd.d', 'j.d.o.o', 'za', 'i', 'u', 'na', 'hr'])

function tokenize(name) {
  return new Set(
    name.toLowerCase()
      .replace(/[.\-–—\/()]/g, ' ')
      .split(/\s+/)
      .map(t => t.replace(/[^a-zšđčćž0-9]/g, ''))
      .filter(t => t.length > 1 && !STOP.has(t))
  )
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

// ── Učitaj podatke ───────────────────────────────────────────────────────────
const wb = XLSX.readFile(EXCEL)
const ws = wb.Sheets[wb.SheetNames[0]]
const excelRows = XLSX.utils.sheet_to_json(ws, { header: 1 })
  .slice(1)
  .filter(r => r[0])
  .map(r => ({
    name: r[0].toString().trim().replace(/^\d+\.\s*/, ''),
    email: (r[1] || '').toString().trim(),
    dostava: (r[2] || '').toString().trim(),
  }))

const registry = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'))
const regTokens = registry.map(e => ({ ...e, tokens: tokenize(e.naziv) }))

// ── Matching ─────────────────────────────────────────────────────────────────
const THRESHOLD_AUTO  = 0.55   // automatski prihvaćamo
const THRESHOLD_MAYBE = 0.30   // prikazujemo kao prijedlog

const results = excelRows.map(row => {
  const qt = tokenize(row.name)
  const scored = regTokens
    .map(e => ({ ...e, score: jaccard(qt, e.tokens) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const best = scored[0]
  return {
    excelName: row.name,
    email: row.email,
    dostava: row.dostava,
    bestScore: best?.score ?? 0,
    bestOib: best?.score >= THRESHOLD_AUTO ? best.oib : null,
    bestNaziv: best?.score >= THRESHOLD_AUTO ? best.naziv : null,
    top3: scored,
  }
})

// ── Izvještaj ─────────────────────────────────────────────────────────────────
const auto    = results.filter(r => r.bestScore >= THRESHOLD_AUTO)
const maybe   = results.filter(r => r.bestScore >= THRESHOLD_MAYBE && r.bestScore < THRESHOLD_AUTO)
const noMatch = results.filter(r => r.bestScore < THRESHOLD_MAYBE)

let report = `MATCHING REPORT — ${new Date().toISOString()}\n`
report += `Ukupno: ${results.length} | Auto (≥${THRESHOLD_AUTO}): ${auto.length} | Prijedlog: ${maybe.length} | Bez podudaranja: ${noMatch.length}\n`
report += '='.repeat(100) + '\n\n'

report += `✅ AUTOMATSKI UPARENO (${auto.length})\n` + '-'.repeat(80) + '\n'
auto.forEach(r => {
  report += `  Excel:    "${r.excelName}"\n`
  report += `  Registar: "${r.bestNaziv}" — OIB: ${r.bestOib} (score: ${r.bestScore.toFixed(3)})\n\n`
})

report += `\n⚠️  PRIJEDLOG — PROVJERI RUČNO (${maybe.length})\n` + '-'.repeat(80) + '\n'
maybe.forEach(r => {
  report += `  Excel: "${r.excelName}"\n`
  r.top3.filter(c => c.score >= THRESHOLD_MAYBE).forEach((c, i) => {
    report += `    [${i+1}] "${c.naziv}" — OIB: ${c.oib} (score: ${c.score.toFixed(3)})\n`
  })
  report += '\n'
})

report += `\n❌ BEZ PODUDARANJA (${noMatch.length})\n` + '-'.repeat(80) + '\n'
noMatch.forEach(r => {
  report += `  "${r.excelName}" — top: "${r.top3[0]?.naziv}" (${r.top3[0]?.score.toFixed(3)})\n`
})

writeFileSync(REPORT_OUT, report, 'utf-8')
console.log(report)

// ── Generiraj TypeScript datoteku ─────────────────────────────────────────────
const tsEntries = results.map(r => ({
  name: r.excelName,
  email: r.email,
  dostava: r.dostava || 'NE',
  oib: r.bestOib || null,
}))

const tsContent = `/**
 * Referentna lista DII korisnika (${tsEntries.length} tijela).
 *
 * Ovo je denominator za statistiku dostave podataka.
 * OIB-ovi su upareni automatski iz registra javnih tijela.
 * Tijela bez OIB-a (oib: null) trebaju ručnu provjeru.
 *
 * NIJE za prikazivanje u UI-u (za to postoji registar-tijela.json).
 * Koristi se isključivo za izračun statistike i praćenje dostave.
 */

export interface DiiEntry {
  name: string
  email: string
  dostava: 'DA' | 'NE' | 'Dopis' | ''
  oib: string | null
}

export const DII_REGISTRY: DiiEntry[] = ${JSON.stringify(tsEntries, null, 2)}

export const DII_REGISTRY_TOTAL = DII_REGISTRY.length

/** OIB-ovi tijela koja su dostavila (DA ili Dopis) prema Excelu */
export const DII_DELIVERED_OIBS = new Set(
  DII_REGISTRY.filter(e => e.oib && (e.dostava === 'DA' || e.dostava === 'Dopis')).map(e => e.oib!)
)
`

writeFileSync(TS_OUT, tsContent, 'utf-8')
console.log(`\nTypeScript datoteka: ${TS_OUT}`)
console.log(`Izvještaj: ${REPORT_OUT}`)
console.log(`\nTijela BEZ OIB-a: ${tsEntries.filter(e => !e.oib).length}`)
