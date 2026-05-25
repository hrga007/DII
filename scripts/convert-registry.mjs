#!/usr/bin/env node
/**
 * Konvertira tijela.csv → public/registar-tijela.json
 *
 * Ulazni CSV (semicolon-separated, UTF-8 BOM):
 *   Rb.;Naziv tijela;OIB;Adresa;Br. pošte;Grad;Telefon;Fax;Www;E-mail;
 *   Ime i prezime službenika;Tel. službenika;E-mail. službenika;
 *   Osnivač;Pravni status;Djelatnost;Zadnja izmjena
 *
 * Izlazni JSON sadrži samo polja potrebna aplikaciji.
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = process.argv[2] ?? resolve(__dirname, '../../../.claude/uploads/940235d0-1e7a-43ad-bc9a-de945fafc0d1/aac1f5e7-tijela.csv')
const DST = resolve(__dirname, '../public/registar-tijela.json')

// ── CSV parser (handles semicolon sep + quoted fields with embedded semis) ──
function parseCSVLine(line) {
  const fields = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ';' && !inQuote) {
      fields.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur.trim())
  return fields
}

const raw = readFileSync(SRC, 'utf-8').replace(/^﻿/, '') // strip BOM
const lines = raw.split('\n').map(l => l.trimEnd()).filter(Boolean)

const header = parseCSVLine(lines[0])
console.log('Zaglavlje:', header.join(' | '))
console.log('Ukupno redaka (bez zaglavlja):', lines.length - 1)

// Indeksi stupaca
const COL = {
  naziv:       header.indexOf('Naziv tijela'),
  oib:         header.indexOf('OIB'),
  email:       header.indexOf('E-mail'),
  grad:        header.indexOf('Grad'),
  pravniStatus: header.indexOf('Pravni status'),
  djelatnost:  header.indexOf('Djelatnost'),
}
console.log('Stupci:', COL)

const entries = []
const seenOib = new Set()
let skipped = 0

for (let i = 1; i < lines.length; i++) {
  const f = parseCSVLine(lines[i])
  const oib = f[COL.oib]?.replace(/\s/g, '') ?? ''
  const naziv = f[COL.naziv] ?? ''

  if (!oib || !naziv) { skipped++; continue }
  if (seenOib.has(oib)) { skipped++; continue } // deduplicate

  seenOib.add(oib)
  entries.push({
    naziv,
    oib,
    email:        f[COL.email] ?? '',
    grad:         f[COL.grad] ?? '',
    pravniStatus: f[COL.pravniStatus] ?? '',
    djelatnost:   f[COL.djelatnost] ?? '',
  })
}

console.log(`Uneseno: ${entries.length}, preskočeno: ${skipped}`)

// Provjeri nekoliko OIB-ova
const sample = entries.slice(0, 3)
sample.forEach(e => console.log(`  ${e.oib}  ${e.naziv.slice(0, 50)}`))

// Ispis pravnih statusa
const statuses = [...new Set(entries.map(e => e.pravniStatus))].sort()
console.log('\nPravni statusi:', statuses)

writeFileSync(DST, JSON.stringify(entries), 'utf-8')
const size = (Buffer.byteLength(JSON.stringify(entries), 'utf-8') / 1024).toFixed(1)
console.log(`\nSpravljeno: ${DST} (${size} KB)`)
