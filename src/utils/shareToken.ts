/**
 * Generira URL-safe nasumični token za share linkove.
 * Koristi Web Crypto API (dostupan u svim modernim preglednicima).
 */
export function generateShareToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now()
}

export function buildShareUrl(token: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`
  const trimmed = base.endsWith('/') ? base : `${base}/`
  return `${trimmed}share/${token}`
}
