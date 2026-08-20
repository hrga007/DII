import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getProvider } from '../providers'
import { isExpired } from '../utils/shareToken'
import { isInitialized } from '../config/firebase'
import { usePageTitle } from '../hooks/usePageTitle'
import type { ShareLink } from '../models/shareLink'
import type { CategoryGroup } from '../models/financialEntry'
import { RegistryClassificationMeta } from '../components/RegistryClassificationFilters'
import { REGISTRY_SOURCE_URL } from '../utils/registryLoader'

const CATEGORIES: CategoryGroup[] = ['CAPEX', 'LICENCE', 'ODRZAVANJE', 'OPEX', 'CLOUD']
const CAT_LABELS: Record<CategoryGroup, string> = {
  CAPEX: 'CAPEX',
  LICENCE: 'Licence',
  ODRZAVANJE: 'Održavanje',
  OPEX: 'OPEX',
  CLOUD: 'Cloud',
}

function fmt(v: number): string {
  return v === 0 ? '—' : v.toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatRegistryTimestamp(value: string | null): string {
  if (!value) return 'nije navedena'
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(value)
  if (!match) return value
  const [, year, month, day, hour, minute, second] = match
  return `${day}.${month}.${year}.${hour ? ` ${hour}:${minute}:${second}` : ''}`
}

/**
 * Javna read-only stranica za pregled podijeljenog izvješća.
 *
 * Ne zahtijeva autentifikaciju. Radi na temelju `token` parametra
 * iz URL-a — token je nasumičan i jedinstven, služi kao implicitna
 * autorizacija.
 */
export function SharePage() {
  const { token } = useParams<{ token: string }>()
  usePageTitle('Podijeljeno izvješće')
  const [link, setLink] = useState<ShareLink | null>(null)
  const [error, setError] = useState<'loading' | 'not_found' | 'expired' | 'no_firebase' | null>('loading')

  useEffect(() => {
    if (!token) {
      setError('not_found')
      return
    }
    if (!isInitialized()) {
      setError('no_firebase')
      return
    }
    getProvider().getShareLinkByToken(token)
      .then((found) => {
        if (!found) {
          setError('not_found')
          return
        }
        if (isExpired(found.expiresAt)) {
          setError('expired')
          setLink(found)
          return
        }
        setLink(found)
        setError(null)
        if (found.id) {
          getProvider().recordShareView(found.id).catch(() => undefined)
        }
      })
      .catch(() => setError('not_found'))
  }, [token])

  if (error === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error === 'no_firebase') {
    return (
      <CenteredMessage icon="⚙️" title="Aplikacija nije konfigurirana" subtitle="Firebase veza nije postavljena na ovom okruženju." />
    )
  }

  if (error === 'not_found') {
    return (
      <CenteredMessage icon="🔗" title="Link nije pronađen" subtitle="Možda je obrisan ili je URL netočan." />
    )
  }

  if (error === 'expired') {
    return (
      <CenteredMessage
        icon="⏰"
        title="Link je istekao"
        subtitle={link ? `Vrijedio je do ${link.expiresAt.toLocaleDateString('hr-HR')}.` : ''}
      />
    )
  }

  if (!link) return null

  return <SharedReportView link={link} />
}

function CenteredMessage({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-md">
        <p className="text-5xl mb-4">{icon}</p>
        <p className="font-semibold text-gray-800 text-lg mb-2">{title}</p>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
    </div>
  )
}

function SharedReportView({ link }: { link: ShareLink }) {
  const { snapshot } = link
  const isInstitution = link.type === 'institution'
  const visibleCategories = snapshot.filters?.categories?.length
    ? CATEGORIES.filter(category => snapshot.filters.categories?.includes(category))
    : CATEGORIES
  const hasClassificationSnapshot = Boolean(
    snapshot.institutionClassifications && Object.keys(snapshot.institutionClassifications).length > 0,
  )
  const registrySource = snapshot.registrySource

  // Build pivot: institution × category
  const pivot = useMemo(() => {
    const rows = snapshot.institutions.map(inst => {
      const entries = snapshot.entries.filter(e => e.institutionId === inst.id)
      const catTotals: Record<CategoryGroup, number> = {} as Record<CategoryGroup, number>
      let total = 0
      CATEGORIES.forEach(cat => {
        const v = entries
          .filter(e => e.categoryGroup === cat)
          .reduce((s, e) => s + (e.amount ?? 0), 0)
        catTotals[cat] = v
        total += v
      })
      return { inst, catTotals, total }
    })
    rows.sort((a, b) => b.total - a.total)
    return rows
  }, [snapshot])

  const colTotals = useMemo(() => {
    const t: Record<CategoryGroup, number> = {} as Record<CategoryGroup, number>
    CATEGORIES.forEach(c => { t[c] = pivot.reduce((s, r) => s + r.catTotals[c], 0) })
    return { ...t, Ukupno: pivot.reduce((s, r) => s + r.total, 0) }
  }, [pivot])

  // Group entries by year (for trend display)
  const yearTotals = useMemo(() => {
    const years = [...new Set(snapshot.entries.map(e => e.year))].sort()
    return years.map(y => ({
      year: y,
      total: snapshot.entries.filter(e => e.year === y).reduce((s, e) => s + (e.amount ?? 0), 0),
    }))
  }, [snapshot.entries])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner */}
      <div className="bg-blue-600 text-white py-2 px-4 text-center text-xs">
        🔗 Ovo je javna read-only verzija izvješća · vrijedi do {link.expiresAt.toLocaleDateString('hr-HR')}
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                {isInstitution ? 'Institucijsko izvješće' : 'Izvješće'} · DII IT Ulaganja
              </p>
              <h1 className="text-2xl font-bold text-gray-800">{link.title}</h1>
              {link.description && (
                <p className="text-sm text-gray-600 mt-2">{link.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-3">
                Stvoreno: {link.createdAt.toLocaleDateString('hr-HR')}
                {link.createdByEmail && ` · ${link.createdByEmail}`}
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm whitespace-nowrap print:hidden"
            >
              🖨 Ispis / PDF
            </button>
          </div>

          {/* Active filters info */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {snapshot.filters?.year !== undefined && (
              <FilterChip label="Godina" value={snapshot.filters.year === 'all' ? 'Sve godine' : String(snapshot.filters.year)} />
            )}
            {snapshot.filters?.valueType && snapshot.filters.valueType !== 'oba' && (
              <FilterChip label="Tip" value={snapshot.filters.valueType} />
            )}
            {snapshot.filters?.categories && snapshot.filters.categories.length < CATEGORIES.length && (
              <FilterChip label="Kategorije" value={snapshot.filters.categories.map(c => CAT_LABELS[c]).join(', ')} />
            )}
            {snapshot.filters?.pravniStatusi && snapshot.filters.pravniStatusi.length > 0 && (
              <FilterChip label="Vrsta tijela" value={snapshot.filters.pravniStatusi.join(', ')} />
            )}
            {snapshot.filters?.djelatnosti && snapshot.filters.djelatnosti.length > 0 && (
              <FilterChip label="Djelatnost" value={snapshot.filters.djelatnosti.join(', ')} />
            )}
            {snapshot.filters?.osnivaci && snapshot.filters.osnivaci.length > 0 && (
              <FilterChip label="Osnivač" value={snapshot.filters.osnivaci.join(', ')} />
            )}
          </div>
          {(hasClassificationSnapshot || registrySource) && (
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              Klasifikacija — smrznuta verzija uz ovaj snapshot:{' '}
              <a
                href={registrySource?.url ?? REGISTRY_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 hover:underline"
              >
                službeni Popis tijela javne vlasti
              </a>
              {registrySource ? (
                <>
                  {' · '}{registrySource.recordCount.toLocaleString('hr-HR')} zapisa
                  {' · najnovija izmjena u izvoru: '}{formatRegistryTimestamp(registrySource.updatedAt)}
                  {' · ove se vrijednosti ne mijenjaju nakon izrade izvješća'}
                </>
              ) : (
                ' · vrijednosti su spremljene u snapshot, ali verzija izvora nije zabilježena u ovom starijem izvješću'
              )}
            </p>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Institucija" value={snapshot.institutions.length} icon="🏛️" />
          <SummaryCard label="Unosa" value={snapshot.entries.length} icon="📊" />
          <SummaryCard label="Ukupno (EUR)" value={fmt(colTotals.Ukupno)} icon="💶" />
          {yearTotals.length > 0 && (
            <SummaryCard label="Godina" value={yearTotals.map(y => y.year).join(', ')} icon="📅" />
          )}
        </div>

        {/* Pivot table */}
        {pivot.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Pregled po kategorijama</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Institucija</th>
                    {visibleCategories.map(c => (
                      <th key={c} className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{CAT_LABELS[c]}</th>
                    ))}
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-700 uppercase">Ukupno</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pivot.map((r) => (
                    <tr key={r.inst.id} className="hover:bg-gray-50">
                      <td className="min-w-80 px-4 py-2 text-gray-700 font-medium">
                        <span>{r.inst.name}</span>
                        <RegistryClassificationMeta
                          classification={r.inst.id ? snapshot.institutionClassifications?.[r.inst.id] : undefined}
                        />
                      </td>
                      {visibleCategories.map(c => (
                        <td key={c} className="px-4 py-2 text-right font-mono text-gray-600">{fmt(r.catTotals[c])}</td>
                      ))}
                      <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800">{fmt(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-2 text-gray-700">UKUPNO</td>
                    {visibleCategories.map(c => (
                      <td key={c} className="px-4 py-2 text-right font-mono">{fmt(colTotals[c])}</td>
                    ))}
                    <td className="px-4 py-2 text-right font-mono">{fmt(colTotals.Ukupno)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resources (only for institution share) */}
        {isInstitution && snapshot.resources && snapshot.resources.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Instalirani resursi</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Data centar</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Resurs</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Jed.</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Instalirano</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Kapacitet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {snapshot.resources.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 text-xs">{r.dataCenterName}</td>
                      <td className="px-4 py-2 text-gray-800 font-medium">{r.resourceName}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{r.unit}</td>
                      <td className="px-4 py-2 text-right font-mono">{String(r.installedValue) || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{String(r.totalCapacity) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 py-4 print:hidden">
          DII IT Ulaganja · Read-only snapshot · Pregled {link.viewCount + 1}.
        </p>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{icon} {label}</p>
      <p className="text-lg font-bold text-gray-800 truncate">{value}</p>
    </div>
  )
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="max-w-full rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-blue-800">
      <span className="font-semibold">{label}:</span> {value}
    </span>
  )
}
