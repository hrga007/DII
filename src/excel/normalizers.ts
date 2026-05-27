const SPECIAL_VALUES = new Set(['NP', 'NE', '-'])

function isGroupedInteger(value: string, separator: string): boolean {
  const escaped = separator === '.' ? '\\.' : separator
  return new RegExp(`^\\d{1,3}(${escaped}\\d{3})+$`).test(value)
}

function parseLocaleNumber(raw: string): number | null {
  const normalized = raw.replace(/\u00a0/g, ' ').trim()
  if (normalized === '') return null

  let sign = ''
  let body = normalized
  if (body.startsWith('+') || body.startsWith('-')) {
    sign = body[0]
    body = body.slice(1)
  }
  body = body.replace(/[\s']/g, '')
  if (!body || !/^\d[0-9.,]*$/.test(body)) return null

  const commaCount = (body.match(/,/g) ?? []).length
  const dotCount = (body.match(/\./g) ?? []).length

  if (commaCount > 0 && dotCount > 0) {
    const decimalSep = body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.'
    const thousandSep = decimalSep === ',' ? '.' : ','
    const decimalParts = body.split(decimalSep)
    if (decimalParts.length !== 2) return null
    const [integerPart, decimalPart] = decimalParts
    if (!decimalPart || !/^\d+$/.test(decimalPart)) return null
    if (integerPart.includes(thousandSep) && !isGroupedInteger(integerPart, thousandSep)) return null
    if (integerPart.includes(decimalSep)) return null
    const parsed = Number(`${sign}${integerPart.replaceAll(thousandSep, '')}.${decimalPart}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  const separator = commaCount > 0 ? ',' : dotCount > 0 ? '.' : null
  if (!separator) {
    const parsed = Number(`${sign}${body}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  const parts = body.split(separator)
  if (parts.some((part) => part === '' || !/^\d+$/.test(part))) return null

  if (isGroupedInteger(body, separator)) {
    const parsed = Number(`${sign}${body.replaceAll(separator, '')}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (parts.length === 2) {
    const [integerPart, decimalPart] = parts
    const parsed = Number(`${sign}${integerPart}.${decimalPart}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

// Converts raw cell value to a number or null.
// Treats empty, null, 'NP', 'NE', '-' as null (no data).
// Treats 0 and '0' as 0 (valid zero value).
export function normalizeAmount(raw: string | number | null): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const trimmed = String(raw).trim()
  if (trimmed === '' || SPECIAL_VALUES.has(trimmed.toUpperCase())) return null
  return parseLocaleNumber(trimmed)
}

export function normalizeText(raw: string | number | null): string {
  if (raw === null || raw === undefined) return ''
  return String(raw).trim()
}

export function isSpecialValue(raw: string | number | null): boolean {
  if (raw === null || raw === undefined || raw === '') return false
  const v = String(raw).trim().toUpperCase()
  return SPECIAL_VALUES.has(v)
}
