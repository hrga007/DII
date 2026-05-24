import { describe, it, expect } from 'vitest'
import { EXPIRY_OPTIONS, type ShareLink } from './shareLink'

describe('shareLink model', () => {
  it('EXPIRY_OPTIONS has reasonable defaults', () => {
    expect(EXPIRY_OPTIONS.length).toBeGreaterThanOrEqual(2)
    EXPIRY_OPTIONS.forEach(o => {
      expect(o.days).toBeGreaterThan(0)
      expect(o.label).toBeTruthy()
    })
  })

  it('expiry days are ascending', () => {
    for (let i = 1; i < EXPIRY_OPTIONS.length; i++) {
      expect(EXPIRY_OPTIONS[i].days).toBeGreaterThan(EXPIRY_OPTIONS[i - 1].days)
    }
  })

  it('ShareLink has required fields', () => {
    const link: ShareLink = {
      token: 't',
      type: 'report',
      title: 'Test',
      createdAt: new Date(),
      createdBy: 'u',
      expiresAt: new Date(),
      viewCount: 0,
      lastViewedAt: null,
      snapshot: {
        filters: {},
        institutions: [],
        entries: [],
      },
    }
    expect(link.token).toBe('t')
    expect(link.type).toBe('report')
    expect(link.snapshot.entries).toEqual([])
  })
})
