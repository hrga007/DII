import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFirebaseAuth } from '../config/firebase'
import { useToast } from '../hooks/useToast'
import { getProvider } from '../providers'
import { getRegistry, REGISTRY_SOURCE_URL } from '../utils/registryLoader'
import { classifyInstitution } from '../utils/reportFilters'
import {
  applyDataRepair,
  recordDataQualityCheck,
  resolveManualFinancialReview,
  runDataIntegrityAudit,
  type DataIntegrityReport,
  type DataRepairKind,
  type ManualFinancialAction,
  type ManualFinancialReview,
} from '../services/dataIntegrityService'

const PAGE_SIZE = 12

const TOOL_COPY: Record<DataRepairKind, { title: string; description: string }> = {
  institutionIds: {
    title: 'Popravi povezanost zapisa',
    description:
      'Upisuje ispravan institutionId u financijske zapise i resurse kada je batch već pravilno povezan s institucijom. Koristi se kada izvještaji ne vide zapise iako je uvoz aktivan.',
  },
  issueCounts: {
    title: 'Osvježi brojače grešaka',
    description:
      'Ponovno izračunava broj otvorenih grešaka i upozorenja iz stvarnih importIssues zapisa. Koristi se kada kartica uvoza prikazuje grešku koja je već riješena.',
  },
  numericAmounts: {
    title: 'Popravi očite brojeve',
    description:
      'Ispravlja samo jednoznačne brojeve u hrvatskom formatu, npr. 18.000,00 u 18000. Ne dira ćelije s više iznosa ili dodatnim tekstom.',
  },
}

function currentUserId(): string {
  return getFirebaseAuth().currentUser?.uid ?? 'unknown'
}

function formatAmount(value: number | null): string {
  if (value === null) return '-'
  return new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 }).format(value)
}

function toolCount(report: DataIntegrityReport | undefined, kind: DataRepairKind): number {
  if (!report) return 0
  if (kind === 'institutionIds') return report.summary.institutionBackfills + report.summary.resourceBackfills
  if (kind === 'issueCounts') return report.summary.issueCountRefreshes
  return report.summary.numericAmountRepairs
}

function severityTone(count: number): string {
  return count > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function ManualReviewRow({
  review,
  onResolve,
  disabled,
}: {
  review: ManualFinancialReview
  onResolve: (review: ManualFinancialReview, action: ManualFinancialAction, manualAmount?: number) => void
  disabled: boolean
}) {
  const [manualValue, setManualValue] = useState('')
  const parsedManual = manualValue.trim() ? Number(manualValue.replace(',', '.')) : undefined

  return (
    <tr className="align-top hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-800">{review.fileName || review.batchId}</div>
        <div className="text-xs text-gray-500 mt-1">
          {review.sourceSheet} · R{review.sourceRowIndex + 1} · {review.year} {review.valueType}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap max-w-sm">{review.rawValue}</td>
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatAmount(review.currentAmount)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolve(review, 'keep')}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Označava zapis kao pregledan i ostavlja postojeći spremljeni iznos."
          >
            Zadrži
          </button>
          {review.firstNumber !== null && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onResolve(review, 'first')}
              className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              title="Sprema prvi broj pronađen u ćeliji kao službeni iznos."
            >
              Prvi: {formatAmount(review.firstNumber)}
            </button>
          )}
          {review.sumNumbers !== null && review.numberCandidates.length > 1 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onResolve(review, 'sum')}
              className="px-3 py-1.5 text-xs rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              title="Zbraja sve brojeve pronađene u ćeliji i sprema zbroj kao službeni iznos."
            >
              Zbroji: {formatAmount(review.sumNumbers)}
            </button>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            placeholder="Ručni iznos"
            className="w-28 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            disabled={disabled || parsedManual === undefined || !Number.isFinite(parsedManual)}
            onClick={() => onResolve(review, 'manual', parsedManual)}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
            title="Sprema ručno uneseni iznos i označava zapis kao pregledan."
          >
            Spremi
          </button>
        </div>
      </td>
    </tr>
  )
}

export function DataQualityPanel() {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)

  const { data: institutions = [], isLoading: institutionsLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: () => getProvider().getInstitutions(),
  })
  const {
    data: registry,
    isLoading: registryLoading,
    isError: registryError,
  } = useQuery({
    queryKey: ['registry'],
    queryFn: getRegistry,
    staleTime: Infinity,
  })
  const unmatchedInstitutions = useMemo(
    () => registry
      ? institutions.filter(institution => !classifyInstitution(institution, registry.byOib).registryMatched)
      : [],
    [institutions, registry],
  )

  const auditQuery = useQuery({
    queryKey: ['dataIntegrityAudit'],
    queryFn: runDataIntegrityAudit,
    enabled: false,
  })

  const runAuditMutation = useMutation({
    mutationFn: async () => {
      const report = await runDataIntegrityAudit()
      await recordDataQualityCheck(currentUserId(), report)
      return report
    },
    onSuccess: (report) => {
      queryClient.setQueryData(['dataIntegrityAudit'], report)
      setPage(0)
      showToast('Provjera podataka je završena', 'success')
    },
    onError: (error) => showToast(error instanceof Error ? error.message : 'Provjera nije uspjela', 'error'),
  })

  const repairMutation = useMutation({
    mutationFn: async (kind: DataRepairKind) => applyDataRepair(kind, currentUserId()),
    onSuccess: (updated) => {
      showToast(`Upisano promjena: ${updated}`, updated > 0 ? 'success' : 'info')
      auditQuery.refetch()
    },
    onError: (error) => showToast(error instanceof Error ? error.message : 'Popravak nije uspio', 'error'),
  })

  const manualMutation = useMutation({
    mutationFn: async ({
      review,
      action,
      manualAmount,
    }: {
      review: ManualFinancialReview
      action: ManualFinancialAction
      manualAmount?: number
    }) => resolveManualFinancialReview(review, action, currentUserId(), manualAmount),
    onSuccess: () => {
      showToast('Zapis je označen kao riješen', 'success')
      auditQuery.refetch()
    },
    onError: (error) => showToast(error instanceof Error ? error.message : 'Ručni ispravak nije uspio', 'error'),
  })

  const report = auditQuery.data
  const manualReviews = useMemo(() => report?.manualFinancialReviews ?? [], [report])
  const totalPages = Math.max(1, Math.ceil(manualReviews.length / PAGE_SIZE))
  const pagedReviews = useMemo(
    () => manualReviews.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [manualReviews, page],
  )

  const isBusy = auditQuery.isFetching || runAuditMutation.isPending || repairMutation.isPending || manualMutation.isPending

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Provjera podataka</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-3xl">
              Alat čita Firestore i traži nepovezane zapise, zastarjele brojače grešaka i financijske vrijednosti koje trebaju provjeru.
              Sama provjera ne mijenja podatke; promjene se rade samo kroz zasebne gumbe ispod.
            </p>
          </div>
          <button
            type="button"
            onClick={() => runAuditMutation.mutate()}
            disabled={isBusy}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isBusy ? 'Provjeravam...' : 'Pokreni provjeru'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-800">Pokrivenost službenom klasifikacijom</h3>
            <p className="mt-1 text-sm text-gray-500">
              Institucije se po OIB-u provjeravaju u Popisu tijela javne vlasti; klasifikacija se ne kopira u Firestore.
            </p>
          </div>
          <a
            href={REGISTRY_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Službeni izvor ↗
          </a>
        </div>

        {registryLoading || institutionsLoading ? (
          <p className="mt-4 text-sm text-gray-400">Provjera OIB podudaranja…</p>
        ) : registryError || !registry ? (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Službeni registar trenutačno nije moguće učitati; pokrivenost nije izračunata.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-xs text-emerald-700">Upareno po OIB-u</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                {institutions.length - unmatchedInstitutions.length} / {institutions.length}
              </p>
            </div>
            <details className={`rounded-xl border px-4 py-3 ${
              unmatchedInstitutions.length > 0
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}>
              <summary className="cursor-pointer text-xs font-semibold">
                Nekategorizirano: {unmatchedInstitutions.length}
              </summary>
              {unmatchedInstitutions.length > 0 && (
                <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-xs">
                  {unmatchedInstitutions.map(institution => (
                    <li key={institution.id ?? `${institution.name}-${institution.oib}`}>
                      {institution.name} · OIB: {institution.oib?.trim() || 'nije upisan'}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        )}
      </section>

      {report && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[
              ['Aktivni batchevi', report.summary.activeBatches],
              ['Aktivni financijski zapisi', report.summary.activeFinancialEntries],
              ['Nepovezani zapisi', report.summary.institutionBackfills + report.summary.resourceBackfills],
              ['Brojači za osvježiti', report.summary.issueCountRefreshes],
              ['Očiti brojevi', report.summary.numericAmountRepairs],
              ['Ručna provjera', report.summary.manualFinancialReviews],
            ].map(([label, value]) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(Object.keys(TOOL_COPY) as DataRepairKind[]).map((kind) => {
              const count = toolCount(report, kind)
              return (
                <div key={kind} className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-gray-800">{TOOL_COPY[kind].title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full border ${severityTone(count)}`}>
                      {count}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2 min-h-20">{TOOL_COPY[kind].description}</p>
                  <button
                    type="button"
                    disabled={isBusy || count === 0}
                    onClick={() => repairMutation.mutate(kind)}
                    className="mt-4 w-full px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    Primijeni
                  </button>
                </div>
              )
            })}
          </section>

          {report.multipleActiveScopes.length > 0 && (
            <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <h3 className="font-semibold text-emerald-900">Više aktivnih uvoza po instituciji</h3>
              <p className="text-sm text-emerald-700 mt-1">
                Ovo nije greška kada se radi o podružnicama ili različitim obrascima pod istim OIB-om. Alat ih prikazuje samo kao informaciju.
              </p>
            </section>
          )}

          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Zapisi za ručnu odluku</h3>
              <p className="text-sm text-gray-500 mt-1">
                Ovdje su ćelije s dodatnim tekstom ili više iznosa. Admin odlučuje hoće li zadržati postojeći iznos, uzeti prvi broj, zbrojiti sve brojeve ili upisati ručni iznos.
              </p>
            </div>

            {manualReviews.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Nema zapisa za ručnu odluku.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Izvor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vrijednost iz ćelije</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Spremljeno</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Odluka</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pagedReviews.map((review) => (
                        <ManualReviewRow
                          key={review.entryId}
                          review={review}
                          disabled={isBusy}
                          onResolve={(item, action, manualAmount) => manualMutation.mutate({ review: item, action, manualAmount })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between p-4 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    Stranica {page + 1} od {totalPages} · {manualReviews.length} zapisa
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Prethodno
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Sljedeće
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
