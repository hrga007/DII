import { useEffect, useRef, useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePageTitle } from '../hooks/usePageTitle'
import { getProvider } from '../providers'
import type { Institution } from '../models/institution'
import type { ImportBatch } from '../models/importBatch'
import { StatusBadge, ActiveBadge } from '../components/StatusBadge'
import { RegistryLinkModal } from '../components/RegistryLinkModal'
import { getRegistry } from '../utils/registryLoader'
import { DII_REGISTRY, DII_REGISTRY_TOTAL } from '../data/diiRegistry'
import type { DiiEntry } from '../data/diiRegistry'

interface InstitutionRow {
  institution: Institution
  batches: ImportBatch[]
  activeBatch: ImportBatch | null
  activeEntries: number
  lastUpload: Date | null
}

type FilterKey = 'sve' | 'greske' | 'nema_aktivnog' | 'nema_batcha'
type SortKey = 'batches_desc' | 'abecedno' | 'datum_desc' | 'greske_desc'
type PageView = 'uvezeni' | 'registar'
type RegistryFilter = 'sve' | 'u_aplikaciji' | 'prepoznato' | 'nije_upareno'

const PAGE_SIZE = 50

interface RegistryViewProps {
  institutions: Institution[]
  batches: ImportBatch[]
  onRequestLink: (institution: Institution) => void
}

function RegistryView({ institutions, batches, onRequestLink }: RegistryViewProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RegistryFilter>('sve')
  const [page, setPage] = useState(0)

  // Load full registry for optional grad/pravniStatus details
  const { data: registry } = useQuery({
    queryKey: ['registry'],
    queryFn: getRegistry,
    staleTime: Infinity,
  })

  const institutionByOib = useMemo(
    () => new Map(institutions.map(i => [i.oib, i])),
    [institutions]
  )
  const activeBatchSet = useMemo(
    () => new Set(batches.filter(b => b.isActive).map(b => b.institutionId)),
    [batches]
  )

  const stats = useMemo(() => {
    let uApp = 0, uRegistru = 0
    for (const entry of DII_REGISTRY) {
      if (!entry.oib) continue
      const inst = institutionByOib.get(entry.oib)
      if (inst) {
        uRegistru++
        if (inst.id != null && activeBatchSet.has(inst.id)) uApp++
      }
    }
    const total = DII_REGISTRY_TOTAL
    return { total, uApp, uRegistru }
  }, [institutionByOib, activeBatchSet])

  const visibleFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return DII_REGISTRY
      .map((diiEntry: DiiEntry) => {
        const inst = diiEntry.oib ? institutionByOib.get(diiEntry.oib) : undefined
        const hasActiveBatch = inst?.id != null ? activeBatchSet.has(inst.id) : false
        const regEntry = diiEntry.oib ? registry?.byOib.get(diiEntry.oib) : undefined
        return { diiEntry, inst, hasActiveBatch, regEntry }
      })
      .filter(({ diiEntry, inst, hasActiveBatch }) => {
        if (filter === 'u_aplikaciji' && !(inst && hasActiveBatch)) return false
        if (filter === 'prepoznato' && (!inst || hasActiveBatch)) return false
        if (filter === 'nije_upareno' && inst) return false
        if (q) {
          const hit =
            diiEntry.name.toLowerCase().includes(q) ||
            (diiEntry.oib?.includes(q) ?? false) ||
            (inst?.name.toLowerCase().includes(q) ?? false)
          if (!hit) return false
        }
        return true
      })
  }, [registry, institutionByOib, activeBatchSet, search, filter])

  // Reset na prvu stranicu kad se promijeni filter
  useEffect(() => setPage(0), [search, filter])

  const totalPages = Math.max(1, Math.ceil(visibleFiltered.length / PAGE_SIZE))
  const visiblePage = visibleFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pct = Math.round((stats.uApp / stats.total) * 100)

  return (
    <div>
      {/* Progress summary */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">Dostava podataka u aplikaciju</p>
          <span className="text-sm font-bold text-gray-800">{stats.uApp} / {stats.total}</span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-bold text-emerald-700">{stats.uApp}</p>
            <p className="text-xs text-gray-400 mt-0.5">S aktivnim uploadom</p>
          </div>
          <div>
            <p className="text-xl font-bold text-blue-600">{stats.uRegistru}</p>
            <p className="text-xs text-gray-400 mt-0.5">Prepoznato po OIB-u</p>
          </div>
          <div>
            <p className="text-xl font-bold text-red-600">{stats.total - stats.uRegistru}</p>
            <p className="text-xs text-gray-400 mt-0.5">Nema u aplikaciji</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: 'sve'          as RegistryFilter, label: 'Sva tijela',     count: stats.total },
            { key: 'u_aplikaciji' as RegistryFilter, label: 'U aplikaciji',   count: stats.uApp },
            { key: 'prepoznato'   as RegistryFilter, label: 'Prepoznato',     count: stats.uRegistru - stats.uApp },
            { key: 'nije_upareno' as RegistryFilter, label: 'Nema u aplik.', count: stats.total - stats.uRegistru },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filter === key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}<span className="opacity-70 ml-1">({count})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Naziv ili OIB..."
            className="pl-8 pr-4 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {visiblePage.length === 0 ? (
          <p className="p-10 text-center text-gray-400 text-sm">Nema rezultata</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {visiblePage.map(({ diiEntry, inst, hasActiveBatch, regEntry }) => {
              const active = !!inst && hasActiveBatch
              const linked = !!inst
              const rowKey = diiEntry.oib ?? diiEntry.name
              const nameMismatch = inst && regEntry && inst.name.trim() !== regEntry.naziv.trim()
              return (
                <div key={rowKey} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${
                    active ? 'bg-emerald-500' : linked ? 'bg-yellow-400' : 'bg-red-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{diiEntry.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {diiEntry.oib
                        ? <span className="text-xs text-gray-400">OIB: {diiEntry.oib}</span>
                        : <span className="text-xs text-orange-500">OIB nepoznat</span>
                      }
                      {regEntry?.grad && <span className="text-xs text-gray-400">· {regEntry.grad}</span>}
                      {diiEntry.email && (
                        <a href={`mailto:${diiEntry.email}`} className="text-xs text-blue-600 hover:underline truncate hidden sm:inline">
                          · {diiEntry.email}
                        </a>
                      )}
                      {inst && (
                        <span className="text-xs text-gray-400">
                          · u aplik.: <Link to={`/institucije/${inst.id}`} className="text-blue-600 hover:underline">{inst.name}</Link>
                        </span>
                      )}
                    </div>
                    {nameMismatch && (
                      <p className="text-xs text-amber-600 mt-0.5 truncate" title={`Naziv u registru: "${regEntry!.naziv}"`}>
                        ⚠ Naziv se razlikuje od registra: &ldquo;{regEntry!.naziv}&rdquo;
                      </p>
                    )}
                    {!nameMismatch && regEntry?.pravniStatus && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{regEntry.pravniStatus}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {diiEntry.dostava !== 'NE' && diiEntry.dostava !== '' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        diiEntry.dostava === 'DA' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        Excel: {diiEntry.dostava}
                      </span>
                    )}
                    {active ? (
                      <button
                        onClick={() => onRequestLink(inst)}
                        className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        ✓ U aplikaciji
                      </button>
                    ) : linked ? (
                      <button
                        onClick={() => onRequestLink(inst)}
                        className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors whitespace-nowrap"
                      >
                        Nema uploada
                      </button>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                        Nije dostavljeno
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {visibleFiltered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-400">
            {visibleFiltered.length} tijela · stranica {page + 1} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              ← Prethodna
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Sljedeća →
            </button>
          </div>
        </div>
      )}
      {visibleFiltered.length > 0 && visibleFiltered.length <= PAGE_SIZE && (
        <p className="text-xs text-gray-400 mt-2 text-right">{visibleFiltered.length} tijela</p>
      )}
    </div>
  )
}

export function filterAndSortRows(
  rows: InstitutionRow[],
  search: string,
  filter: FilterKey,
  sort: SortKey,
): InstitutionRow[] {
  let result = rows.filter((r) => {
    const matchText =
      r.institution.name.toLowerCase().includes(search.toLowerCase()) ||
      r.institution.oib.includes(search)
    if (!matchText) return false
    if (filter === 'greske')        return r.batches.some((b) => b.errorCount > 0)
    if (filter === 'nema_aktivnog') return r.batches.length > 0 && !r.activeBatch
    if (filter === 'nema_batcha')   return r.batches.length === 0
    return true
  })
  result = [...result].sort((a, b) => {
    if (sort === 'abecedno')    return a.institution.name.localeCompare(b.institution.name, 'hr')
    if (sort === 'datum_desc')  return (b.lastUpload?.getTime() ?? 0) - (a.lastUpload?.getTime() ?? 0)
    if (sort === 'greske_desc') return b.batches.reduce((s, x) => s + x.errorCount, 0) - a.batches.reduce((s, x) => s + x.errorCount, 0)
    return b.batches.length - a.batches.length
  })
  return result
}

export function InstitutionsPage() {
  usePageTitle('Institucije')
  const location = useLocation()
  const qc = useQueryClient()
  const locState = location.state as { expandId?: string; view?: PageView } | null
  const [view, setView] = useState<PageView>(locState?.view ?? 'uvezeni')
  const [expanded, setExpanded] = useState<string | null>(locState?.expandId ?? null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('sve')
  const [sort, setSort] = useState<SortKey>('batches_desc')
  const [linkTarget, setLinkTarget] = useState<Institution | null>(null)
  const expandedRef = useRef<HTMLDivElement | null>(null)

  const { data: institutions = [], isLoading: instLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: () => getProvider().getInstitutions(),
  })
  const { data: batches = [], isLoading: batchLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: () => getProvider().getBatches(),
  })
  // Registry se fetchuje jednom i cachea — koristi se za badge u listi institucija
  const { data: registry } = useQuery({
    queryKey: ['registry'],
    queryFn: getRegistry,
    staleTime: Infinity,
  })
  const loading = instLoading || batchLoading

  const rows = useMemo(() => {
    const mapped: InstitutionRow[] = institutions.map((inst) => {
      const ibs = batches.filter((b) => b.institutionId === inst.id)
      const activeBatch = ibs.find((b) => b.isActive) ?? null
      const activeEntries = activeBatch ? (activeBatch.importSummary?.financialEntriesCount ?? 0) : 0
      const dates = ibs.map((b) => b.uploadedAt.getTime())
      return {
        institution: inst,
        batches: ibs,
        activeBatch,
        activeEntries,
        lastUpload: dates.length ? new Date(Math.max(...dates)) : null,
      }
    })
    mapped.sort((a, b) => {
      if (b.batches.length !== a.batches.length) return b.batches.length - a.batches.length
      return a.institution.name.localeCompare(b.institution.name, 'hr')
    })
    return mapped
  }, [institutions, batches])

  useEffect(() => {
    if (expanded && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [expanded, rows])

  const filtered = filterAndSortRows(rows, search, filter, sort)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-xl font-bold text-gray-800">Institucije</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
            {([
              { key: 'uvezeni' as PageView, label: 'Uvezeni podaci' },
              { key: 'registar' as PageView, label: 'Registar dostave' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  view === key
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'uvezeni' && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pretraži naziv ili OIB..."
                className="pl-8 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal — ručno uparivanje institucije s registarskim unosom */}
      {linkTarget && (
        <RegistryLinkModal
          institutionName={linkTarget.name}
          currentRegistryIndex={linkTarget.registryIndex}
          onConfirm={async (idx) => {
            await getProvider().updateInstitutionRegistryIndex(linkTarget.id!, idx)
            qc.invalidateQueries({ queryKey: ['institutions'] })
          }}
          onClose={() => setLinkTarget(null)}
        />
      )}

      {view === 'registar' && (
        <RegistryView
          institutions={institutions}
          batches={batches}
          onRequestLink={setLinkTarget}
        />
      )}

      {view === 'uvezeni' && (<>

      {/* Filters + sort */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: 'sve',           label: 'Sve' },
            { key: 'greske',        label: 'Ima greške' },
            { key: 'nema_aktivnog', label: 'Nema aktivnog' },
            { key: 'nema_batcha',   label: 'Bez batcha' },
          ] as { key: FilterKey; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filter === key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
              {key !== 'sve' && (() => {
                const count = rows.filter((r) => {
                  if (key === 'greske')        return r.batches.some((b) => b.errorCount > 0)
                  if (key === 'nema_aktivnog') return r.batches.length > 0 && !r.activeBatch
                  if (key === 'nema_batcha')   return r.batches.length === 0
                  return false
                }).length
                return count > 0 ? <span className="ml-1 opacity-70">({count})</span> : null
              })()}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="batches_desc">Sortiraj: po uvozima</option>
            <option value="abecedno">Sortiraj: A–Z</option>
            <option value="datum_desc">Sortiraj: najnoviji upload</option>
            <option value="greske_desc">Sortiraj: najviše grešaka</option>
          </select>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Institucije',    value: rows.length, icon: '🏛️', sub: undefined },
          { label: 'Uvozi ukupno', value: rows.reduce((s, r) => s + r.batches.length, 0), icon: '📦', sub: `${rows.filter((r) => r.activeBatch !== null).length} s aktivnim` },
          { label: 'Financ. unosa', value: rows.reduce((s, r) => s + r.activeEntries, 0).toLocaleString('hr-HR'), icon: '📊', sub: 'iz aktivnih batcheva' },
        ].map(({ label, value, icon, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{icon} {label}</p>
            <p className="text-xl font-bold text-gray-800">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-3xl mb-2">🏛️</p>
          <p className="font-medium">{search ? 'Nema rezultata pretrage' : 'Nema institucija'}</p>
          <p className="text-sm mt-1">Institucije se kreiraju automatski pri uvozu Excel datoteka</p>
        </div>
      ) : (<div className="space-y-3">
          {filtered.map((row) => {
            const id = row.institution.id!
            const isOpen = expanded === id
            const hasErrors = row.batches.some((b) => b.errorCount > 0)
            // OIB-based registry lookup — registry se lazy-loada, badge se prikaže kad bude dostupan
            const regEntry = registry?.byOib.get(row.institution.oib)

            return (
              <div key={id} ref={isOpen ? expandedRef : null} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Institution header row */}
                <div className="flex items-center gap-3 p-4 sm:p-5 hover:bg-gray-50 transition-colors">
                  {/* Icon — links to InstitutionDetailPage */}
                  <Link
                    to={`/institucije/${id}`}
                    className="shrink-0 w-10 h-10 rounded-xl p-lt-bg flex items-center justify-center p-tx font-bold text-sm hover:opacity-70 transition-opacity"
                    title="Otvori detalje institucije"
                  >
                    {row.institution.name.charAt(0).toUpperCase()}
                  </Link>

                  {/* Registry badge — OIB-based */}
                  {regEntry ? (
                    <span
                      className="shrink-0 hidden sm:inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"
                      title={regEntry.naziv}
                    >
                      🔗 {regEntry.naziv.length > 25 ? regEntry.naziv.slice(0, 25) + '…' : regEntry.naziv}
                    </span>
                  ) : registry ? (
                    <span
                      className="shrink-0 hidden sm:inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"
                      title="OIB nije pronađen u registru javnih tijela"
                    >
                      🔗 Nije u registru
                    </span>
                  ) : null}

                  {/* Expand button: main info + stats + chevron */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{row.institution.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">OIB: {row.institution.oib}</p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500 mr-2">
                    <span title="Uvozi">
                      <span className="font-semibold text-gray-700">{row.batches.length}</span>
                      <span className="text-xs ml-1">
                        {row.batches.length === 1 ? 'batch' : 'batch-eva'}
                        {row.batches.length > 1 && (
                          <span className="ml-1 text-amber-600">({row.batches.filter(b => b.isActive).length} aktivan)</span>
                        )}
                      </span>
                    </span>
                    <span title="Financijski unosi iz aktivnog batcha">
                      <span className={`font-semibold ${hasErrors ? 'text-red-600' : 'text-gray-700'}`}>
                        {row.activeEntries}
                      </span>
                      <span className="text-xs ml-1">unosa</span>
                    </span>
                    {!row.activeBatch && row.batches.length > 0 && (
                      <span className="text-xs text-amber-600 font-medium">Nema aktivnog!</span>
                    )}
                    {row.lastUpload && (
                      <span className="text-xs text-gray-400">
                        {row.lastUpload.toLocaleDateString('hr-HR')}
                      </span>
                    )}
                  </div>

                  {/* Mobile stats */}
                  <div className="sm:hidden flex flex-col items-end text-xs text-gray-500 mr-1">
                    <span>{row.batches.length} batch-eva</span>
                    {!row.activeBatch && row.batches.length > 0 && (
                      <span className="text-amber-600 font-medium">Nema aktivnog!</span>
                    )}
                    {row.lastUpload && (
                      <span className="text-gray-400">{row.lastUpload.toLocaleDateString('hr-HR')}</span>
                    )}
                  </div>

                  {/* Chevron */}
                  <span className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                  </button>
                </div>

                {/* Expanded batch list */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {row.batches.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-gray-400 text-center">Nema batch-eva za ovu instituciju</p>
                    ) : (
                      <>
                        {/* Contact info */}
                        {(row.institution.contactName || row.institution.contactEmail) && (
                          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
                            {row.institution.contactName && (
                              <span>👤 {row.institution.contactName}</span>
                            )}
                            {row.institution.contactEmail && (
                              <a href={`mailto:${row.institution.contactEmail}`} className="p-tx hover:underline">
                                ✉️ {row.institution.contactEmail}
                              </a>
                            )}
                            {row.institution.dcCount && (
                              <span>🖥️ {row.institution.dcCount} DC</span>
                            )}
                          </div>
                        )}

                        {/* Batch list */}
                        {row.batches.length > 1 && (
                          <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                            Institucija ima {row.batches.length} batcha. U izvješće ulaze samo podaci iz <strong>aktivnog</strong> batcha.
                          </div>
                        )}
                        <div className="divide-y divide-gray-50">
                          {row.batches.map((b) => (
                            <Link
                              key={b.id}
                              to={`/imports/${b.id}`}
                              state={{ from: 'institucije', institutionId: id }}
                              className={`flex items-center gap-3 px-5 py-3 transition-colors group hover:bg-gray-50 ${!b.isActive ? 'opacity-60' : ''}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium text-gray-700 truncate" style={{ transition: 'color 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--p-tx)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '')}
                                  >
                                    {b.fileName}
                                  </p>
                                  <ActiveBadge isActive={b.isActive} />
                                  {b.isActive && (
                                    <span className="text-xs text-emerald-700 font-medium">↑ ulazi u izvješće</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {b.uploadedAt.toLocaleDateString('hr-HR')} ·{' '}
                                  {(b.fileSize / 1024).toFixed(1)} KB ·{' '}
                                  {b.importSummary?.financialEntriesCount ?? 0} unosa
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="hidden sm:flex gap-2 text-xs">
                                  {b.errorCount > 0 && (
                                    <span className="text-red-600">{b.errorCount} grešaka</span>
                                  )}
                                  {b.warningCount > 0 && (
                                    <span className="text-yellow-600">{b.warningCount} upoz.</span>
                                  )}
                                </div>
                                <StatusBadge status={b.processingStatus} />
                                <span className="text-gray-300 p-tx" style={{ opacity: 0.5 }}>›</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      </>)}
    </div>
  )
}
