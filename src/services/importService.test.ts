import { describe, it, expect } from 'vitest'
import type { ImportStep, ImportProgress } from './importService'

describe('ImportService types', () => {
  it('ImportProgress has correct shape', () => {
    const p: ImportProgress = { step: 'hash', message: 'test' }
    expect(p.step).toBe('hash')
  })

  it('all ImportStep values are valid strings', () => {
    const steps: ImportStep[] = ['hash', 'duplicate_check', 'parse', 'validate', 'save', 'done', 'error']
    expect(steps).toHaveLength(7)
  })
})
