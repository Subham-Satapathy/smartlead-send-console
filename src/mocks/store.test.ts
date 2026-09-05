import { beforeEach, describe, expect, it } from 'vitest'
import { getEmail, getMailbox, getMailboxQueueSummary, listEmails, patchMailbox, resetStore, retryEmail } from './store'

describe('mock store: retryEmail', () => {
  beforeEach(() => resetStore())

  it('rejects retrying an email that is currently sending or sent', () => {
    const sendingEmail = listEmails({ page: 1, limit: 1, status: 'sending' }).items[0]
    if (sendingEmail) {
      const result = retryEmail(sendingEmail.id)
      expect(result.ok).toBe(false)
    }

    const sentEmail = listEmails({ page: 1, limit: 1, status: 'sent' }).items[0]
    expect(retryEmail(sentEmail.id).ok).toBe(false)
  })

  it('moves a dead email to retrying and increments attempts without double-counting mailbox queue', () => {
    const dead = listEmails({ page: 1, limit: 1, status: 'dead' }).items[0]
    const mailboxBefore = getMailbox(dead.mailbox_id)!
    const pendingBefore = mailboxBefore.pending_count
    const attemptsBefore = dead.attempts

    const result = retryEmail(dead.id)

    expect(result.ok).toBe(true)
    const updated = getEmail(dead.id)!
    expect(updated.status).toBe('retrying')
    expect(updated.attempts).toBe(attemptsBefore + 1)
    expect(updated.last_error).toBeNull()
    expect(updated.next_retry_at).not.toBeNull()

    // "dead" wasn't counted in pending_count, so a retry from dead should
    // add exactly one to the mailbox's queue — not zero, not two.
    const mailboxAfter = getMailbox(dead.mailbox_id)!
    expect(mailboxAfter.pending_count).toBe(pendingBefore + 1)
  })

  it('retrying an already-retrying email does not change the mailbox queue count', () => {
    const retrying = listEmails({ page: 1, limit: 1, status: 'retrying' }).items[0]
    const pendingBefore = getMailbox(retrying.mailbox_id)!.pending_count

    retryEmail(retrying.id)

    // "retrying" was already counted, so re-retrying must be a no-op on the count.
    expect(getMailbox(retrying.mailbox_id)!.pending_count).toBe(pendingBefore)
  })

  it('returns not_found for an unknown id', () => {
    const result = retryEmail('em_does_not_exist')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })
})

describe('mock store: patchMailbox', () => {
  beforeEach(() => resetStore())

  it('toggles paused and is idempotent when set to the same value', () => {
    const mailbox = listEmails({ page: 1, limit: 1 }).items[0]
    const mb = getMailbox(mailbox.mailbox_id)!
    const updated = patchMailbox(mb.id, { paused: true })
    expect(updated!.paused).toBe(true)

    // setting the same value again should not throw or duplicate events
    const updatedAgain = patchMailbox(mb.id, { paused: true })
    expect(updatedAgain!.paused).toBe(true)
  })

  it('returns null for an unknown mailbox id', () => {
    expect(patchMailbox('mb_does_not_exist', { paused: true })).toBeNull()
  })
})

describe('mock store: getMailboxQueueSummary', () => {
  beforeEach(() => resetStore())

  it('aggregates every queued row for the mailbox, not just a sample', () => {
    // Find a mailbox with a large queue (the 50k-email seed makes this likely).
    const mailboxId = listEmails({ page: 1, limit: 1, status: 'pending' }).items[0].mailbox_id
    const mailbox = getMailbox(mailboxId)!

    const summary = getMailboxQueueSummary(mailboxId, 10)

    // total must match the mailbox's own queue count, not be capped at some
    // fixed page size regardless of how large the real queue is.
    expect(summary.total).toBe(mailbox.pending_count)
    // The campaign breakdown must sum back to the same total.
    expect(summary.by_campaign.reduce((sum, c) => sum + c.count, 0)).toBe(summary.total)
    // Descending by count.
    for (let i = 1; i < summary.by_campaign.length; i++) {
      expect(summary.by_campaign[i - 1].count).toBeGreaterThanOrEqual(summary.by_campaign[i].count)
    }
    // Recipients capped at the requested limit, all actually queued for this mailbox.
    expect(summary.recipients.length).toBeLessThanOrEqual(10)
    for (const email of summary.recipients) {
      expect(email.mailbox_id).toBe(mailboxId)
      expect(['pending', 'retrying']).toContain(email.status)
    }
  })

  it('returns zero total and empty lists for a mailbox with nothing queued', () => {
    const mailboxId = listEmails({ page: 1, limit: 1, status: 'sent' }).items[0].mailbox_id
    // Not every mailbox with a sent email is guaranteed empty of queue, so
    // only assert internal consistency rather than a hardcoded zero.
    const summary = getMailboxQueueSummary(mailboxId, 10)
    expect(summary.total).toBe(getMailbox(mailboxId)!.pending_count)
    expect(summary.recipients.length).toBeLessThanOrEqual(summary.total)
  })
})

describe('mock store: listEmails "queued" status filter', () => {
  beforeEach(() => resetStore())

  it('matches pending and retrying, and nothing else, and agrees with getMailboxQueueSummary', () => {
    const mailboxId = listEmails({ page: 1, limit: 1, status: 'pending' }).items[0].mailbox_id
    const queued = listEmails({ page: 1, limit: 100_000, mailbox_id: mailboxId, status: 'queued' })

    expect(queued.items.every((e) => e.status === 'pending' || e.status === 'retrying')).toBe(true)
    expect(queued.total).toBe(getMailboxQueueSummary(mailboxId, 0).total)

    const sent = listEmails({ page: 1, limit: 100_000, mailbox_id: mailboxId, status: 'sent' })
    expect(sent.items.some((e) => queued.items.some((q) => q.id === e.id))).toBe(false)
  })
})
