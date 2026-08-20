#!/usr/bin/env node
/**
 * Preuzima službeni Popis tijela javne vlasti i generira
 * public/registar-tijela.json.
 *
 * Službeni izvor (Povjerenik za informiranje Republike Hrvatske):
 *   https://tjv.pristupinfo.hr/?download=
 *
 * Pokretanje:
 *   npm run registry:refresh
 *   node scripts/convert-registry.mjs --source C:\\put\\do\\tijela.csv
 *   node scripts/convert-registry.mjs --source https://... --output C:\\izlaz.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OFFICIAL_SOURCE_URL = 'https://tjv.pristupinfo.hr/?download='

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUTPUT = resolve(scriptDirectory, '../public/registar-tijela.json')
const MINIMUM_EXPECTED_ENTRIES = 5_000
const FETCH_TIMEOUT_MS = 30_000

const REQUIRED_COLUMNS = {
  naziv: 'Naziv tijela',
  oib: 'OIB',
  email: 'E-mail',
  grad: 'Grad',
  osnivac: 'Osnivač',
  pravniStatus: 'Pravni status',
  djelatnost: 'Djelatnost',
  zadnjaIzmjena: 'Zadnja izmjena',
}

function usage() {
  return [
    'Uporaba: node scripts/convert-registry.mjs [opcije]',
    '',
    `  --source <URL|putanja>  CSV izvor (zadano: ${OFFICIAL_SOURCE_URL})`,
    `  --output <putanja>      JSON odredište (zadano: ${DEFAULT_OUTPUT})`,
    '  --help                  Prikaži ovu pomoć',
  ].join('\n')
}

function parseArguments(argv) {
  const options = { source: OFFICIAL_SOURCE_URL, output: DEFAULT_OUTPUT }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      console.log(usage())
      process.exit(0)
    }

    if (argument !== '--source' && argument !== '--output') {
      throw new Error(`Nepoznata opcija: ${argument}\n\n${usage()}`)
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Opcija ${argument} zahtijeva vrijednost.`)
    }

    if (argument === '--source') options.source = value
    if (argument === '--output') options.output = resolve(value)
    index += 1
  }

  return options
}

/**
 * RFC 4180-compatible parser prilagođen službenom CSV-u sa separatorom `;`.
 * Podržava navodnike, escaped navodnike i nove retke unutar navedenih polja.
 */
function parseCsv(rawCsv) {
  const csv = rawCsv.replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]

    if (character === '"') {
      if (inQuotes && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === ';' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      field = ''
      continue
    }

    field += character
  }

  if (inQuotes) throw new Error('CSV završava unutar nezatvorenih navodnika.')

  row.push(field)
  if (row.some(value => value !== '')) rows.push(row)
  if (rows.length === 0) throw new Error('CSV je prazan.')

  return rows
}

async function loadSource(source) {
  if (!/^https?:\/\//i.test(source)) {
    console.log(`Izvor: lokalna datoteka ${resolve(source)}`)
    return readFileSync(resolve(source))
  }

  console.log(`Izvor: ${source}`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(source, {
      headers: { Accept: 'text/csv' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Preuzimanje nije uspjelo: HTTP ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('text/csv')) {
      throw new Error(`Izvor nije vratio CSV (Content-Type: ${contentType || 'nije naveden'}).`)
    }

    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Preuzimanje je prekinuto nakon ${FETCH_TIMEOUT_MS / 1000} sekundi.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch (error) {
    throw new Error('CSV nije valjan UTF-8 dokument.', { cause: error })
  }
}

function buildEntries(rows) {
  const header = rows[0]
  const columnIndexes = Object.fromEntries(
    Object.entries(REQUIRED_COLUMNS).map(([property, column]) => {
      const index = header.indexOf(column)
      if (index === -1) throw new Error(`U CSV-u nedostaje obvezni stupac: ${column}`)
      if (header.indexOf(column, index + 1) !== -1) {
        throw new Error(`CSV sadrži ponovljeni stupac: ${column}`)
      }
      return [property, index]
    }),
  )

  const expectedWidth = header.length
  const byOib = new Map()

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const sourceRow = rowIndex + 1

    if (row.length !== expectedWidth) {
      throw new Error(
        `Redak ${sourceRow} ima ${row.length} polja, a zaglavlje ${expectedWidth}.`,
      )
    }

    const oib = row[columnIndexes.oib].replace(/\s/g, '')
    // Službeni izvor trenutačno sadrži i nekoliko 10-znamenkastih vrijednosti.
    // Ne nadopunjujemo ih proizvoljno nulom: izvorni OIB ostaje jedini autoritet.
    if (!/^\d{10,11}$/.test(oib)) {
      throw new Error(`Redak ${sourceRow} ima nevaljan OIB: ${JSON.stringify(oib)}`)
    }

    const entry = {
      naziv: row[columnIndexes.naziv],
      oib,
      email: row[columnIndexes.email],
      grad: row[columnIndexes.grad],
      osnivac: row[columnIndexes.osnivac],
      pravniStatus: row[columnIndexes.pravniStatus],
      djelatnost: row[columnIndexes.djelatnost],
      zadnjaIzmjena: row[columnIndexes.zadnjaIzmjena],
    }

    if (!entry.naziv) {
      throw new Error(`Redak ${sourceRow} nema naziv tijela.`)
    }

    const existing = byOib.get(oib)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(entry)) {
        throw new Error(`OIB ${oib} pojavljuje se više puta s različitim podacima.`)
      }
      continue
    }

    byOib.set(oib, entry)
  }

  const entries = [...byOib.values()].sort((left, right) => left.oib.localeCompare(right.oib))
  if (entries.length < MINIMUM_EXPECTED_ENTRIES) {
    throw new Error(
      `Registar sadrži samo ${entries.length} jedinstvenih zapisa; očekuje se najmanje ${MINIMUM_EXPECTED_ENTRIES}.`,
    )
  }

  return entries
}

function uniqueSorted(entries, property) {
  return [...new Set(entries.map(entry => entry[property]))].sort((left, right) =>
    left.localeCompare(right, 'hr'),
  )
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const source = await loadSource(options.source)
  const rows = parseCsv(decodeUtf8(source))
  const entries = buildEntries(rows)
  const statuses = uniqueSorted(entries, 'pravniStatus')
  const activities = uniqueSorted(entries, 'djelatnost')
  const founders = uniqueSorted(entries, 'osnivac')
  const emptyCounts = Object.fromEntries(
    ['osnivac', 'pravniStatus', 'djelatnost', 'zadnjaIzmjena'].map(property => [
      property,
      entries.filter(entry => !entry[property]).length,
    ]),
  )
  const nonStandardOibs = entries.filter(entry => entry.oib.length !== 11).length

  const json = `${JSON.stringify(entries)}\n`
  writeFileSync(options.output, json, 'utf8')

  console.log(`Zapisa: ${entries.length} (jedinstveni OIB-i: ${entries.length})`)
  console.log(`OIB-i koji u službenom izvoru nemaju 11 znamenaka: ${nonStandardOibs}`)
  console.log(`Pravni statusi (${statuses.length}): ${statuses.join(' | ')}`)
  console.log(`Djelatnosti (${activities.length}): ${activities.join(' | ')}`)
  console.log(`Osnivači (${founders.length}): ${founders.join(' | ')}`)
  console.log(
    `Prazne službene vrijednosti: osnivač ${emptyCounts.osnivac}, pravni status ${emptyCounts.pravniStatus}, ` +
      `djelatnost ${emptyCounts.djelatnost}, zadnja izmjena ${emptyCounts.zadnjaIzmjena}`,
  )
  console.log(`Odredište: ${options.output} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KiB)`)
}

main().catch(error => {
  console.error(`Greška pri osvježavanju registra: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
