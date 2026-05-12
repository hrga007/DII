// ISO 7064 Mod 11,10 — Croatian OIB (personal identification number) validation
export function validateOib(raw: string): boolean {
  const oib = raw.trim()
  if (!/^\d{11}$/.test(oib)) return false

  let remainder = 10
  for (let i = 0; i < 10; i++) {
    remainder = (remainder + parseInt(oib[i], 10)) % 10
    if (remainder === 0) remainder = 10
    remainder = (remainder * 2) % 11
  }

  const check = 11 - remainder
  const controlDigit = check === 10 ? 0 : check
  return controlDigit === parseInt(oib[10], 10)
}

export function formatOibError(raw: string): string {
  const oib = raw.trim()
  if (!/^\d{11}$/.test(oib)) return 'OIB mora imati točno 11 znamenki'
  if (!validateOib(oib)) return 'OIB nije validan (kontrolna znamenka ne odgovara)'
  return ''
}
