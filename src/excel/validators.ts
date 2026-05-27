import type { ImportIssue } from '../models/financialEntry'
import { validateOib } from '../utils/oibValidator'

export interface ValidationContext {
  batchId: string
  sheetName: string
}

export interface ValidationResult {
  issues: Omit<ImportIssue, 'id'>[]
  valid: boolean
}

export function validateRequiredField(
  value: string | number | null,
  fieldName: string,
  rowLabel: string,
  ctx: ValidationContext
): Omit<ImportIssue, 'id'> | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return {
      batchId: ctx.batchId,
      severity: 'error',
      sheetName: ctx.sheetName,
      rowLabel,
      fieldName,
      message: `Obavezno polje "${fieldName}" nije popunjeno`,
      originalValue: String(value ?? ''),
      createdAt: new Date(),
    }
  }
  return null
}

export function validateOIB(
  oib: string,
  ctx: ValidationContext
): Omit<ImportIssue, 'id'> | null {
  const clean = oib.replace(/\s/g, '')
  if (!/^\d{11}$/.test(clean)) {
    return {
      batchId: ctx.batchId,
      severity: 'error',
      sheetName: ctx.sheetName,
      rowLabel: 'Opći podaci',
      fieldName: 'OIB',
      message: `OIB "${oib}" nije ispravan (mora imati 11 znamenki)`,
      originalValue: oib,
      createdAt: new Date(),
    }
  }
  if (!validateOib(clean)) {
    return {
      batchId: ctx.batchId,
      severity: 'warning',
      sheetName: ctx.sheetName,
      rowLabel: 'Opći podaci',
      fieldName: 'OIB',
      message: `OIB "${oib}" ima 11 znamenki, ali kontrolna znamenka ne odgovara ISO7064 provjeri`,
      originalValue: oib,
      createdAt: new Date(),
    }
  }
  return null
}

export function validateNumericOrSpecial(
  value: string | number | null,
  fieldName: string,
  rowLabel: string,
  ctx: ValidationContext
): Omit<ImportIssue, 'id'> | null {
  if (value === null || value === '' || value === undefined) return null
  if (typeof value === 'number') return null
  const trimmed = String(value).trim().toUpperCase()
  if (trimmed === 'NP' || trimmed === 'NE' || trimmed === '-') return null
  const parsed = parseFloat(trimmed.replace(',', '.'))
  if (isNaN(parsed)) {
    return {
      batchId: ctx.batchId,
      severity: 'warning',
      sheetName: ctx.sheetName,
      rowLabel,
      fieldName,
      message: `Vrijednost "${value}" nije broj niti poznata oznaka (NP/NE/-)`,
      originalValue: String(value),
      createdAt: new Date(),
    }
  }
  return null
}
