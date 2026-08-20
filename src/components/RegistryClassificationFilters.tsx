import { useId, useMemo, useState } from 'react'
import type {
  ClassificationDimension,
  ClassificationFilterState,
  ClassificationOptions,
  InstitutionClassification,
} from '../utils/reportFilters'
import { NEKATEGORIZIRANO } from '../utils/reportFilters'

export interface RegistryClassificationFiltersProps {
  options: ClassificationOptions
  selected: ClassificationFilterState
  onChange: (dimension: ClassificationDimension, values: Set<string>) => void
  disabled?: boolean
}

const DIMENSIONS: Array<{
  key: ClassificationDimension
  label: string
  allLabel: string
  searchPlaceholder: string
}> = [
  { key: 'pravniStatus', label: 'Vrsta tijela', allLabel: 'Sve vrste tijela', searchPlaceholder: 'Pretraži vrste…' },
  { key: 'djelatnost', label: 'Djelatnost', allLabel: 'Sve djelatnosti', searchPlaceholder: 'Pretraži djelatnosti…' },
  { key: 'osnivac', label: 'Osnivač', allLabel: 'Svi osnivači', searchPlaceholder: 'Pretraži osnivače…' },
]

const hrCollator = new Intl.Collator('hr', { sensitivity: 'base', usage: 'search' })

function matchesSearch(value: string, query: string): boolean {
  if (!query.trim()) return true
  const normalizedQuery = query.trim().toLocaleLowerCase('hr')
  const normalizedValue = value.toLocaleLowerCase('hr')
  if (normalizedValue.includes(normalizedQuery)) return true
  return hrCollator.compare(normalizedValue, normalizedQuery) === 0
}

export function RegistryClassificationFilters({
  options,
  selected,
  onChange,
  disabled = false,
}: RegistryClassificationFiltersProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {DIMENSIONS.map(dimension => (
        <ClassificationSelect
          key={dimension.key}
          dimension={dimension}
          options={options[dimension.key]}
          selected={selected[dimension.key]}
          onChange={values => onChange(dimension.key, values)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

interface ClassificationSelectProps {
  dimension: typeof DIMENSIONS[number]
  options: readonly string[]
  selected: ReadonlySet<string>
  onChange: (values: Set<string>) => void
  disabled: boolean
}

function ClassificationSelect({ dimension, options, selected, onChange, disabled }: ClassificationSelectProps) {
  const inputId = useId()
  const [search, setSearch] = useState('')
  const visibleOptions = useMemo(
    () => options.filter(option => matchesSearch(option, search)),
    [options, search],
  )
  const summary = selected.size === 0
    ? dimension.allLabel
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} odabrano`

  function toggle(value: string) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <details className="group relative" data-filter={dimension.key}>
      <summary
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
        onClick={event => {
          if (disabled) event.preventDefault()
        }}
        className={`list-none rounded-xl border bg-white px-3.5 py-2.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          disabled
            ? 'pointer-events-none border-gray-200 opacity-60'
            : selected.size > 0
              ? 'cursor-pointer border-blue-300 shadow-sm shadow-blue-100 hover:border-blue-400'
              : 'cursor-pointer border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }`}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              {dimension.label}
            </span>
            <span className={`mt-0.5 block truncate text-sm ${selected.size > 0 ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
              {summary}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-gray-400 transition-transform group-open:rotate-180">⌄</span>
        </span>
      </summary>

      <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10">
        <div className="border-b border-gray-100 p-2.5">
          <label htmlFor={inputId} className="sr-only">{dimension.searchPlaceholder}</label>
          <input
            id={inputId}
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={dimension.searchPlaceholder}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs">
          <span className="text-gray-500">{options.length} vrijednosti</span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
            >
              Prikaži sve
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto p-1.5" role="group" aria-label={dimension.label}>
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-gray-400">Nema podudaranja</p>
          ) : visibleOptions.map(option => (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                selected.has(option) ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(option)}
                onChange={() => toggle(option)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
              />
              <span className={option === NEKATEGORIZIRANO ? 'font-medium text-amber-700' : ''}>{option}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  )
}

export function RegistryClassificationMeta({
  classification,
  className = '',
}: {
  classification?: Pick<InstitutionClassification, 'pravniStatus' | 'djelatnost' | 'osnivac'>
  className?: string
}) {
  if (!classification) return null

  const isUncategorized = classification.pravniStatus === NEKATEGORIZIRANO
    && classification.djelatnost === NEKATEGORIZIRANO
    && classification.osnivac === NEKATEGORIZIRANO

  if (isUncategorized) {
    return (
      <span className={`mt-1 block text-[11px] font-medium leading-4 text-amber-700 ${className}`}>
        {NEKATEGORIZIRANO}
      </span>
    )
  }

  return (
    <span className={`mt-1 block max-w-xl text-[11px] font-normal leading-4 text-gray-500 ${className}`}>
      <span title="Vrsta tijela">{classification.pravniStatus}</span>
      <span aria-hidden="true" className="mx-1.5 text-gray-300">•</span>
      <span title="Djelatnost">{classification.djelatnost}</span>
      <span className="block truncate text-gray-400" title={`Osnivač: ${classification.osnivac}`}>
        Osnivač: {classification.osnivac}
      </span>
    </span>
  )
}
