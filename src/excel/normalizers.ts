// Converts raw cell value to a number or null.
// Treats empty, null, 'NP', 'NE', '-' as null (no data).
// Treats 0 and '0' as 0 (valid zero value).
export function normalizeAmount(raw: string | number | null): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return raw
  const trimmed = String(raw).trim()
  if (trimmed === '' || trimmed === 'NP' || trimmed === 'NE' || trimmed === '-') return null
  const parsed = parseFloat(trimmed.replace(/\s/g, '').replace(',', '.'))
  return isNaN(parsed) ? null : parsed
}

export function normalizeText(raw: string | number | null): string {
  if (raw === null || raw === undefined) return ''
  return String(raw).trim()
}

export function isSpecialValue(raw: string | number | null): boolean {
  if (raw === null || raw === undefined || raw === '') return false
  const v = String(raw).trim().toUpperCase()
  return v === 'NP' || v === 'NE' || v === '-'
}
