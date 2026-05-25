/**
 * Lazy loader za registar javnih tijela (5 754 unosa).
 *
 * JSON se fetchuje iz /registar-tijela.json jednom i cachea u memoriji.
 * Svi pozivatelji dijele isti Promise/cache — nema višestrukih requesta.
 *
 * Uparivanje institucija radi po OIB-u: determinističko, bez fuzzy matchinga.
 */

export interface RegistryEntry {
  naziv: string
  oib: string
  email: string
  grad: string
  pravniStatus: string
  djelatnost: string
}

export interface RegistryData {
  entries: RegistryEntry[]
  byOib: Map<string, RegistryEntry>
}

export const PRAVNI_STATUSI = [
  'Državna tijela',
  'Tijela državne uprave',
  'Agencije i druge samostalne pravne osobe s javnim ovlastima RH',
  'Sudovi i pravosudna tijela',
  'Jedinica lokalne ili područne (regionalne) samouprave',
  'Ustanove',
  'Trgovačka društva',
  'Udruge',
  'Ostale pravne osobe i tijela s javnim ovlastima',
] as const

export type PravniStatus = typeof PRAVNI_STATUSI[number]

let _cache: RegistryData | null = null
let _pending: Promise<RegistryData> | null = null

export async function getRegistry(): Promise<RegistryData> {
  if (_cache) return _cache
  if (!_pending) {
    const base = import.meta.env.BASE_URL ?? '/'
    _pending = fetch(`${base}registar-tijela.json`)
      .then(r => r.json() as Promise<RegistryEntry[]>)
      .then(entries => {
        _cache = { entries, byOib: new Map(entries.map(e => [e.oib, e])) }
        _pending = null
        return _cache
      })
  }
  return _pending
}
