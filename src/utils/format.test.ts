import { describe, expect, it } from 'vitest'
import { formatNextRetry, formatRelativeTime, mailboxHealthLabel } from './format'

describe('formatRelativeTime', () => {
  const now = new Date('2026-01-01T12:00:00Z').getTime()

  it('returns an em dash for null', () => {
    expect(formatRelativeTime(null, now)).toBe('—')
  })

  it('describes the immediate past/future distinctly', () => {
    expect(formatRelativeTime(new Date(now - 500).toISOString(), now)).toBe('just now')
    expect(formatRelativeTime(new Date(now + 500).toISOString(), now)).toBe('in a moment')
  })

  it('formats past times as "ago"', () => {
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 mins ago')
  })

  it('formats future times as "in"', () => {
    expect(formatRelativeTime(new Date(now + 2 * 3_600_000).toISOString(), now)).toBe('in 2 hrs')
  })

  it('uses singular units for a value of 1', () => {
    expect(formatRelativeTime(new Date(now - 60_000).toISOString(), now)).toBe('1 min ago')
  })
})

describe('formatNextRetry', () => {
  const now = new Date('2026-01-01T12:00:00Z').getTime()

  it('returns an em dash for null', () => {
    expect(formatNextRetry(null, now)).toBe('—')
  })

  it('matches formatRelativeTime for future values', () => {
    expect(formatNextRetry(new Date(now + 2 * 3_600_000).toISOString(), now)).toBe('in 2 hrs')
  })

  it('says "Due now" for the immediate window, not "just now"', () => {
    expect(formatNextRetry(new Date(now - 500).toISOString(), now)).toBe('Due now')
  })

  it('frames an overdue value as still pending, not a past event', () => {
    expect(formatNextRetry(new Date(now - 23 * 60_000).toISOString(), now)).toBe('Overdue by 23 mins')
  })
})

describe('mailboxHealthLabel', () => {
  it('prioritizes paused over throttled', () => {
    const result = mailboxHealthLabel({ paused: true, throttled_until: new Date(Date.now() + 60_000).toISOString() })
    expect(result.label).toBe('Paused')
  })

  it('reports throttled when throttled_until is in the future', () => {
    const result = mailboxHealthLabel({ paused: false, throttled_until: new Date(Date.now() + 60_000).toISOString() })
    expect(result.label).toBe('Throttled')
  })

  it('reports active when throttled_until has passed', () => {
    const result = mailboxHealthLabel({ paused: false, throttled_until: new Date(Date.now() - 60_000).toISOString() })
    expect(result.label).toBe('Active')
  })

  it('reports active with no throttle set', () => {
    const result = mailboxHealthLabel({ paused: false, throttled_until: null })
    expect(result.label).toBe('Active')
  })
})
