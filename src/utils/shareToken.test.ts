import { describe, it, expect } from 'vitest'
import { generateShareToken, isExpired } from './shareToken'

describe('generateShareToken', () => {
  it('produces a non-empty string', () => {
    const t = generateShareToken()
    expect(t.length).toBeGreaterThan(20)
  })

  it('produces URL-safe characters only', () => {
    for (let i = 0; i < 20; i++) {
      const t = generateShareToken()
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('produces different tokens on each call', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) seen.add(generateShareToken())
    expect(seen.size).toBe(50)
  })

  it('respects byteLength parameter', () => {
    const short = generateShareToken(8)
    const long = generateShareToken(48)
    expect(long.length).toBeGreaterThan(short.length)
  })
})

describe('isExpired', () => {
  it('returns true for past date', () => {
    expect(isExpired(new Date('2000-01-01'))).toBe(true)
  })

  it('returns false for future date', () => {
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false)
  })

  it('returns true for exact now (or slightly past)', () => {
    expect(isExpired(new Date(Date.now() - 1))).toBe(true)
  })
})

// buildShareUrl koristi window/import.meta — testira se kroz integraciju u browseru
