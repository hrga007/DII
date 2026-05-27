import { describe, it, expect } from 'vitest'
import { normalizeAmount, normalizeText, isSpecialValue } from './normalizers'

describe('normalizeAmount', () => {
  it('returns null for null', () => expect(normalizeAmount(null)).toBeNull())
  it('returns null for empty string', () => expect(normalizeAmount('')).toBeNull())
  it('returns null for NP', () => expect(normalizeAmount('NP')).toBeNull())
  it('returns null for NE', () => expect(normalizeAmount('NE')).toBeNull())
  it('returns null for -', () => expect(normalizeAmount('-')).toBeNull())
  it('returns 0 for 0', () => expect(normalizeAmount(0)).toBe(0))
  it('returns 0 for "0"', () => expect(normalizeAmount('0')).toBe(0))
  it('parses integer', () => expect(normalizeAmount(1000)).toBe(1000))
  it('parses float string', () => expect(normalizeAmount('1234.56')).toBe(1234.56))
  it('parses comma decimal', () => expect(normalizeAmount('1234,56')).toBe(1234.56))
  it('parses string with spaces', () => expect(normalizeAmount('1 234')).toBe(1234))
  it('parses Croatian thousands and decimal separators', () => {
    expect(normalizeAmount('1.234,56')).toBe(1234.56)
    expect(normalizeAmount('1.234.567,89')).toBe(1234567.89)
  })
  it('parses English thousands and decimal separators', () => {
    expect(normalizeAmount('1,234.56')).toBe(1234.56)
    expect(normalizeAmount('1,234,567.89')).toBe(1234567.89)
  })
  it('parses spaced Croatian decimals', () => expect(normalizeAmount('1 234,56')).toBe(1234.56))
  it('parses grouped whole numbers', () => {
    expect(normalizeAmount('1.234')).toBe(1234)
    expect(normalizeAmount('1,234')).toBe(1234)
  })
  it('returns null for non-numeric string', () => expect(normalizeAmount('abc')).toBeNull())
  it('returns null for malformed grouping', () => expect(normalizeAmount('12.34.567')).toBeNull())
  it('returns null for repeated decimal separators', () => expect(normalizeAmount('1.234,567,89')).toBeNull())
})

describe('normalizeText', () => {
  it('returns empty for null', () => expect(normalizeText(null)).toBe(''))
  it('trims whitespace', () => expect(normalizeText('  test  ')).toBe('test'))
  it('converts number to string', () => expect(normalizeText(42)).toBe('42'))
})

describe('isSpecialValue', () => {
  it('returns true for NP', () => expect(isSpecialValue('NP')).toBe(true))
  it('returns true for NE', () => expect(isSpecialValue('NE')).toBe(true))
  it('returns true for -', () => expect(isSpecialValue('-')).toBe(true))
  it('is case insensitive for np', () => expect(isSpecialValue('np')).toBe(true))
  it('returns false for regular value', () => expect(isSpecialValue('1000')).toBe(false))
  it('returns false for null', () => expect(isSpecialValue(null)).toBe(false))
})
