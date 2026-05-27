import { describe, it, expect } from 'vitest'
import { validateRequiredField, validateOIB, validateNumericOrSpecial } from './validators'

const ctx = { batchId: 'test-batch', sheetName: 'Test' }

describe('validateRequiredField', () => {
  it('returns null for valid string', () => {
    expect(validateRequiredField('value', 'field', 'R1', ctx)).toBeNull()
  })
  it('returns issue for empty string', () => {
    const issue = validateRequiredField('', 'field', 'R1', ctx)
    expect(issue).not.toBeNull()
    expect(issue?.severity).toBe('error')
  })
  it('returns issue for null', () => {
    expect(validateRequiredField(null, 'field', 'R1', ctx)).not.toBeNull()
  })
  it('returns issue for whitespace only', () => {
    expect(validateRequiredField('   ', 'field', 'R1', ctx)).not.toBeNull()
  })
  it('returns null for 0', () => {
    expect(validateRequiredField(0, 'field', 'R1', ctx)).toBeNull()
  })
})

describe('validateOIB', () => {
  it('returns null for valid ISO7064 OIB', () => {
    expect(validateOIB('69435151530', ctx)).toBeNull()
  })
  it('returns warning for 11-digit OIB with invalid control digit', () => {
    const issue = validateOIB('12345678901', ctx)
    expect(issue?.severity).toBe('warning')
  })
  it('returns error for short OIB', () => {
    const issue = validateOIB('1234', ctx)
    expect(issue?.severity).toBe('error')
  })
  it('returns error for OIB with letters', () => {
    expect(validateOIB('1234567890X', ctx)).not.toBeNull()
  })
  it('strips whitespace before validating', () => {
    expect(validateOIB(' 69435151530 ', ctx)).toBeNull()
  })
})

describe('validateNumericOrSpecial', () => {
  it('returns null for valid number', () => {
    expect(validateNumericOrSpecial(1000, 'amount', 'R1', ctx)).toBeNull()
  })
  it('returns null for NP string', () => {
    expect(validateNumericOrSpecial('NP', 'amount', 'R1', ctx)).toBeNull()
  })
  it('returns null for null', () => {
    expect(validateNumericOrSpecial(null, 'amount', 'R1', ctx)).toBeNull()
  })
  it('returns warning for non-numeric string', () => {
    const issue = validateNumericOrSpecial('abc', 'amount', 'R1', ctx)
    expect(issue?.severity).toBe('warning')
  })
  it('returns null for parseable float string', () => {
    expect(validateNumericOrSpecial('1234.56', 'amount', 'R1', ctx)).toBeNull()
  })
  it('returns null for Croatian formatted amount', () => {
    expect(validateNumericOrSpecial('1.234,56', 'amount', 'R1', ctx)).toBeNull()
  })
  it('returns warning for malformed grouped amount', () => {
    const issue = validateNumericOrSpecial('12.34.567', 'amount', 'R1', ctx)
    expect(issue?.severity).toBe('warning')
  })
})
