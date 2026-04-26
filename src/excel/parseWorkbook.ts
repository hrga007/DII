import * as XLSX from 'xlsx'

export type RawSheet = (string | number | null)[][]

export interface ParsedWorkbook {
  opcePodaci: RawSheet
  capex: RawSheet
  odrzavanje: RawSheet
  operativni: RawSheet
  licence: RawSheet
  cloud: RawSheet
  resursi: RawSheet
  missingSheets: string[]
}

const EXPECTED_SHEETS: Record<keyof Omit<ParsedWorkbook, 'missingSheets'>, string> = {
  opcePodaci: 'Opći podaci',
  capex: 'CAPEX infrastruktura',
  odrzavanje: 'Održavanje',
  operativni: 'Operativni troškovi',
  licence: 'Licence i softver',
  cloud: 'Cloud trošak po pružatelju',
  resursi: 'Trenutno instalirani resursi',
}

export function parseWorkbook(file: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(file, { type: 'array' })

  const readSheet = (name: string): RawSheet => {
    const ws = wb.Sheets[name]
    if (!ws) return []
    return XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
    })
  }

  const missingSheets: string[] = []
  const result = {} as ParsedWorkbook

  for (const [key, sheetName] of Object.entries(EXPECTED_SHEETS)) {
    if (!wb.SheetNames.includes(sheetName)) {
      missingSheets.push(sheetName)
      result[key as keyof typeof EXPECTED_SHEETS] = []
    } else {
      result[key as keyof typeof EXPECTED_SHEETS] = readSheet(sheetName)
    }
  }

  result.missingSheets = missingSheets
  return result
}

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
