/**
 * Lazy loader za službeni Popis tijela javne vlasti.
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
  osnivac: string
  pravniStatus: string
  djelatnost: string
  zadnjaIzmjena: string
}

export interface RegistryData {
  entries: RegistryEntry[]
  byOib: Map<string, RegistryEntry>
  pravniStatusi: string[]
  djelatnosti: string[]
  osnivaci: string[]
  registryUpdatedAt: string | null
}

/** Izvor ugrađene kopije registra i jedini autoritet za klasifikacije. */
export const REGISTRY_SOURCE_URL = 'https://tjv.pristupinfo.hr/?download='

/** UI oznaka za institucije bez OIB-a ili podudaranja u službenom registru. */
export const NEKATEGORIZIRANO = 'Nekategorizirano' as const

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

/**
 * Vrijednosti potvrđene u službenom izvoru pri zadnjem osvježavanju registra.
 * Za filtere u radu aplikacije koristi derivirane RegistryData vrijednosti kako
 * bi se nove službene kategorije automatski propagirale kroz aplikaciju.
 */
export const DJELATNOSTI = [
  'Gospodarstvo',
  'Hidrometeorološka djelatnost',
  'Javna uprava i politički sustav',
  'Javne financije',
  'Javni red i sigurnost',
  'Komunalne usluge i vodno gospodarstvo',
  'Kultura i umjetnost',
  'Obrana i nacionalna sigurnost',
  'Odgoj, obrazovanje, znanost i sport',
  'Ostalo - neklasificirane djelatnosti',
  'Poljoprivreda, šumarstvo i veterinarstvo',
  'Pravosuđe',
  'Promet i komunikacije',
  'Regionalni razvoj',
  'Socijalna zaštita',
  'Statistika i informacijsko-dokumentacijska djelatnost',
  'Turizam',
  'Vanjski poslovi',
  'Zapošljavanje, rad i radni odnosi',
  'Zaštita okoliša i održivi razvoj',
  'Zdravstvo',
] as const

export const OSNIVACI = [
  'Fizička ili privatna pravna osoba',
  'Javnopravno tijelo ili tijelo s prenesenim javnim ovlastima',
  'Jedinica lokalne ili područne (regionalne) samouprave',
  'Republika Hrvatska',
] as const

function uniqueSorted(entries: RegistryEntry[], property: keyof RegistryEntry): string[] {
  return [...new Set(entries.map(entry => entry[property].trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'hr'),
  )
}

function isRegistryEntry(value: unknown): value is RegistryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  const hasStringFields = [
    'naziv',
    'oib',
    'email',
    'grad',
    'osnivac',
    'pravniStatus',
    'djelatnost',
    'zadnjaIzmjena',
  ].every(property => typeof entry[property] === 'string')

  return hasStringFields
    && (entry.naziv as string).length > 0
    && /^\d{10,11}$/.test(entry.oib as string)
}

function isValidRegistryTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return false

  const [, year, month, day, hour, minute, second] = match.map(Number)
  const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return timestamp.getUTCFullYear() === year
    && timestamp.getUTCMonth() === month - 1
    && timestamp.getUTCDate() === day
    && timestamp.getUTCHours() === hour
    && timestamp.getUTCMinutes() === minute
    && timestamp.getUTCSeconds() === second
}

function latestRegistryTimestamp(entries: RegistryEntry[]): string | null {
  return entries
    .map(entry => entry.zadnjaIzmjena)
    .filter(isValidRegistryTimestamp)
    .sort()
    .at(-1) ?? null
}

async function loadRegistry(): Promise<RegistryData> {
  const base = import.meta.env.BASE_URL ?? '/'
  const response = await fetch(`${base}registar-tijela.json`)
  if (!response.ok) {
    throw new Error(`Učitavanje registra nije uspjelo (HTTP ${response.status}).`)
  }

  const value: unknown = await response.json()
  if (!Array.isArray(value) || !value.every(isRegistryEntry)) {
    throw new Error('Registar tijela nema očekivanu strukturu.')
  }

  const entries = value
  const byOib = new Map<string, RegistryEntry>()
  for (const entry of entries) {
    if (byOib.has(entry.oib)) throw new Error(`Registar sadrži ponovljeni OIB: ${entry.oib}`)
    byOib.set(entry.oib, entry)
  }

  return {
    entries,
    byOib,
    pravniStatusi: uniqueSorted(entries, 'pravniStatus'),
    djelatnosti: uniqueSorted(entries, 'djelatnost'),
    osnivaci: uniqueSorted(entries, 'osnivac'),
    registryUpdatedAt: latestRegistryTimestamp(entries),
  }
}

let _cache: RegistryData | null = null
let _pending: Promise<RegistryData> | null = null

export async function getRegistry(): Promise<RegistryData> {
  if (_cache) return _cache
  if (!_pending) {
    _pending = loadRegistry()
      .then(registry => {
        _cache = registry
        return registry
      })
      .finally(() => {
        _pending = null
      })
  }
  return _pending
}
