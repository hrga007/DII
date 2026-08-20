/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DII_REGISTRY } from '../data/diiRegistry'

interface RegistryJsonEntry {
  naziv: string
  oib: string
  email: string
  grad: string
  osnivac: string
  pravniStatus: string
  djelatnost: string
  zadnjaIzmjena: string
}

const registry = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/registar-tijela.json'), 'utf8'),
) as RegistryJsonEntry[]

describe('ugrađeni službeni Popis tijela javne vlasti', () => {
  it('sadrži jedinstvene OIB-e i potpunu službenu klasifikaciju', () => {
    expect(registry.length).toBeGreaterThan(5_000)

    const uniqueOibs = new Set(registry.map(entry => entry.oib))
    expect(uniqueOibs.size).toBe(registry.length)

    const invalid = registry.filter(entry =>
      !entry.naziv.trim()
      || !/^\d{10,11}$/.test(entry.oib)
      || !entry.osnivac.trim()
      || !entry.pravniStatus.trim()
      || !entry.djelatnost.trim()
      || typeof entry.zadnjaIzmjena !== 'string',
    )
    expect(invalid).toEqual([])
  })

  it('pokriva svaki poznati OIB iz DII popisa dostave', () => {
    const officialOibs = new Set(registry.map(entry => entry.oib))
    const missing = DII_REGISTRY
      .filter(entry => entry.oib && !officialOibs.has(entry.oib))
      .map(entry => `${entry.name} (${entry.oib})`)

    expect(missing).toEqual([])
  })
})
