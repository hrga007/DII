import * as XLSX from 'xlsx'
import type { FinancialEntry } from '../models/financialEntry'

const GROUP_LABELS: Record<string, string> = {
  CAPEX:      'CAPEX Infrastruktura',
  ODRZAVANJE: 'Održavanje',
  LICENCE:    'Licence i softver',
  OPEX:       'Operativni troškovi',
  CLOUD:      'Cloud troškovi',
}

function formatEurNumber(v: number | null): number | string {
  return v === null ? '' : v
}

interface ExportRow {
  Kategorija: string
  Grupa: string
  Godina: number
  Vrsta: string
  'Iznos (EUR)': number | string
  Napomena: string
}

function toRows(entries: FinancialEntry[]): ExportRow[] {
  return entries.map((e) => ({
    Kategorija: e.categoryName,
    Grupa: GROUP_LABELS[e.categoryGroup] ?? e.categoryGroup,
    Godina: e.year,
    Vrsta: e.valueType,
    'Iznos (EUR)': formatEurNumber(e.normalizedValue),
    Napomena: e.note ?? '',
  }))
}

/** Download filtered financial entries as .xlsx */
export function exportToExcel(entries: FinancialEntry[], filename = 'financijski-podaci.xlsx') {
  const rows = toRows(entries)
  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 40 }, // Kategorija
    { wch: 24 }, // Grupa
    { wch: 8  }, // Godina
    { wch: 14 }, // Vrsta
    { wch: 16 }, // Iznos
    { wch: 30 }, // Napomena
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Financije')
  XLSX.writeFile(wb, filename)
}

/** Download audit log as .xlsx */
export function exportAuditToExcel(
  logs: { timestamp: Date; userId: string; action: string; entityType: string; entityId: string; details: Record<string, unknown> }[],
  filename = 'audit-log.xlsx',
) {
  const rows = logs.map((l) => ({
    Vrijeme: l.timestamp.toLocaleString('hr-HR'),
    Korisnik: l.userId,
    Akcija: l.action,
    Tip: l.entityType,
    'Entitet ID': l.entityId,
    Detalji: Object.entries(l.details)
      .filter(([, v]) => typeof v !== 'object' || v === null)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('; '),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 60 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Audit log')
  XLSX.writeFile(wb, filename)
}

/** Download filtered financial entries as .csv (UTF-8 with BOM for Excel) */
export function exportToCsv(entries: FinancialEntry[], filename = 'financijski-podaci.csv') {
  const rows = toRows(entries)
  if (rows.length === 0) return

  const headers = Object.keys(rows[0]) as (keyof ExportRow)[]
  const escape = (v: string | number) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ]

  // UTF-8 BOM so Excel opens it correctly
  const bom = '﻿'
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
