import { faker } from '@faker-js/faker'
import type { Campaign, Email, EmailStatus, Event, Mailbox } from '@/types/domain'

const MAILBOX_COUNT = 50
const CAMPAIGN_COUNT = 10
const EMAIL_COUNT = 50_000
// High enough that the ~7k synthetic seed events (for emails seeded directly
// into failed/retrying/dead) survive alongside runtime churn without being
// evicted before the app even loads.
const MAX_EVENTS = 20_000

const ERROR_MESSAGES = [
  'SMTP 421 4.7.0: Temporary throttle, try again later',
  'SMTP 550 5.1.1: Mailbox does not exist',
  'Connection timed out while negotiating TLS',
  'SMTP 421 4.4.2: Connection dropped mid-transmission',
  'DNS resolution failed for recipient domain',
  'SMTP 550 5.7.1: Message rejected as spam',
  'Greylisted by recipient server, deferring',
]

faker.seed(42)

let mailboxes: Map<string, Mailbox>
let campaigns: Map<string, Campaign>
let emails: Map<string, Email>
let emailOrder: string[] // stable insertion order for cursor-free pagination
let events: Event[]

/**
 * Appends an event to the in-memory event log, evicting the oldest entries past {@link MAX_EVENTS}.
 * @param entity_id - Id of the mailbox/email/system entity the event belongs to.
 * @param type - Event type, e.g. `'email.sent'`.
 * @param payload - Arbitrary event-specific data. Defaults to `{}`.
 * @param timestamp - ISO timestamp to backdate the event to. Defaults to now.
 * @returns Nothing; mutates the module-level `events` array.
 */
function pushEvent(entity_id: string, type: string, payload: Record<string, unknown> = {}, timestamp?: string) {
  events.push({ timestamp: timestamp ?? new Date().toISOString(), entity_id, type, payload })
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
}

/**
 * Picks a random email status, weighted to resemble a realistic send-queue distribution.
 * @returns A randomly chosen {@link EmailStatus}.
 */
function weightedStatus(): EmailStatus {
  const r = Math.random()
  if (r < 0.52) return 'pending'
  if (r < 0.55) return 'sending'
  if (r < 0.6) return 'retrying'
  if (r < 0.9) return 'sent'
  if (r < 0.96) return 'failed'
  return 'dead'
}

/**
 * Picks a plausible attempt count for a seeded email, given its status.
 * @param status - The email's seeded status.
 * @returns A random attempt count consistent with that status.
 */
function attemptsFor(status: EmailStatus): number {
  switch (status) {
    case 'pending':
    case 'sending':
      return 0
    case 'sent':
      return 1
    case 'retrying':
      return faker.number.int({ min: 1, max: 3 })
    case 'failed':
      return faker.number.int({ min: 1, max: 4 })
    case 'dead':
      return faker.number.int({ min: 4, max: 6 })
  }
}

/**
 * Regenerates the entire mock dataset (mailboxes, campaigns, emails, and seed events) from scratch.
 * @returns Nothing; replaces all module-level state.
 */
export function resetStore() {
  mailboxes = new Map()
  campaigns = new Map()
  emails = new Map()
  emailOrder = []
  events = []

  for (let i = 1; i <= CAMPAIGN_COUNT; i++) {
    const id = `cp_${String(i).padStart(2, '0')}`
    campaigns.set(id, {
      id,
      name: `${faker.company.catchPhraseAdjective()} ${faker.company.buzzNoun()} Outreach`,
      pending: 0,
      sending: 0,
      retrying: 0,
      sent: 0,
      dead: 0,
    })
  }

  for (let i = 1; i <= MAILBOX_COUNT; i++) {
    const id = `mb_${String(i).padStart(2, '0')}`
    const hourly_limit = faker.number.int({ min: 20, max: 150 })
    const isThrottled = Math.random() < 0.12
    const isPaused = Math.random() < 0.08
    mailboxes.set(id, {
      id,
      email_address: faker.internet.email({ provider: 'smartlead-sender.com' }).toLowerCase(),
      hourly_limit,
      sent_last_hour: faker.number.int({ min: 0, max: hourly_limit }),
      pending_count: 0, // recomputed below
      paused: isPaused,
      throttled_until: isThrottled
        ? new Date(Date.now() + faker.number.int({ min: 60_000, max: 45 * 60_000 })).toISOString()
        : null,
    })

    // Backdated so seeded paused/throttled mailboxes already have a history.
    if (isPaused) {
      pushEvent(id, 'mailbox.paused', { by: 'operator' }, new Date(Date.now() - faker.number.int({ min: 60_000, max: 6 * 3600_000 })).toISOString())
    }
    if (isThrottled) {
      pushEvent(id, 'mailbox.throttled', { hourly_limit }, new Date(Date.now() - faker.number.int({ min: 10_000, max: 20 * 60_000 })).toISOString())
    }
  }

  const mailboxIds = [...mailboxes.keys()]
  const campaignIds = [...campaigns.keys()]
  const now = Date.now()

  for (let i = 1; i <= EMAIL_COUNT; i++) {
    const id = `em_${String(i).padStart(6, '0')}`
    const status = weightedStatus()
    const mailbox_id = faker.helpers.arrayElement(mailboxIds)
    const campaign_id = faker.helpers.arrayElement(campaignIds)
    const scheduledOffsetMs = faker.number.int({ min: -14 * 24 * 3600_000, max: 6 * 3600_000 })
    const attempts = attemptsFor(status)

    let next_retry_at: string | null = null
    let last_error: string | null = null

    if (status === 'retrying') {
      // Mix of due-now (stuck-looking) and future-scheduled retries.
      const dueOffset = Math.random() < 0.4 ? -faker.number.int({ min: 1000, max: 600_000 }) : faker.number.int({ min: 5_000, max: 1800_000 })
      next_retry_at = new Date(now + dueOffset).toISOString()
      last_error = faker.helpers.arrayElement(ERROR_MESSAGES)
    } else if (status === 'failed') {
      last_error = faker.helpers.arrayElement(ERROR_MESSAGES)
    } else if (status === 'dead') {
      last_error = faker.helpers.arrayElement(ERROR_MESSAGES)
    }

    // Backdated so emails seeded already-stuck have a status history too.
    if (status === 'retrying' || status === 'failed' || status === 'dead') {
      const backdated = new Date(now - faker.number.int({ min: 30_000, max: 3 * 3600_000 })).toISOString()
      pushEvent(id, 'email.sending', {}, backdated)
      pushEvent(id, 'email.failed', { error: last_error }, backdated)
      if (status === 'dead') pushEvent(id, 'email.dead', { attempts }, new Date(now - faker.number.int({ min: 5_000, max: 60_000 })).toISOString())
      else if (status === 'retrying') pushEvent(id, 'email.retry_failed', { attempt: attempts, error: last_error }, new Date(now - faker.number.int({ min: 5_000, max: 60_000 })).toISOString())
    }

    const email: Email = {
      id,
      campaign_id,
      mailbox_id,
      recipient: faker.internet.email().toLowerCase(),
      subject: faker.helpers.arrayElement([
        'Quick question about {{company}}',
        'Following up',
        'Idea for your team',
        '{{firstName}}, worth a look?',
        'Re: intro',
      ]),
      scheduled_at: new Date(now + scheduledOffsetMs).toISOString(),
      status,
      attempts,
      next_retry_at,
      last_error,
    }

    emails.set(id, email)
    emailOrder.push(id)

    const mailbox = mailboxes.get(mailbox_id)!
    if (status === 'pending' || status === 'retrying') mailbox.pending_count += 1

    const campaign = campaigns.get(campaign_id)!
    if (status === 'pending') campaign.pending += 1
    else if (status === 'sending') campaign.sending += 1
    else if (status === 'retrying') campaign.retrying += 1
    else if (status === 'sent') campaign.sent += 1
    else if (status === 'dead') campaign.dead += 1
  }

  pushEvent('system', 'system.seeded', { mailboxes: MAILBOX_COUNT, campaigns: CAMPAIGN_COUNT, emails: EMAIL_COUNT })
}

resetStore()

// ---- accessors -------------------------------------------------------

/**
 * Computes aggregate mailbox/campaign/email counts across the whole store.
 * @returns A stats object matching the `/stats` API response shape.
 */
export function getStats() {
  let pending = 0,
    sending = 0,
    retrying = 0,
    sent = 0,
    dead = 0
  for (const c of campaigns.values()) {
    pending += c.pending
    sending += c.sending
    retrying += c.retrying
    sent += c.sent
    dead += c.dead
  }
  return {
    mailboxes: mailboxes.size,
    campaigns: campaigns.size,
    emails_total: emails.size,
    emails_pending: pending,
    emails_sending: sending,
    emails_retrying: retrying,
    emails_sent: sent,
    emails_dead: dead,
    generated_at: new Date().toISOString(),
  }
}

/**
 * Filters, sorts, and paginates mailboxes.
 * @param params - Page/limit, an optional email-address search term, status filter
 * (`'paused'` | `'throttled'` | `'active'`), and sort key.
 * @returns A paginated envelope of matching mailboxes.
 */
export function listMailboxes(params: {
  page: number
  limit: number
  search?: string
  status?: string
  sort?: string
}) {
  let list = [...mailboxes.values()]

  if (params.search) {
    const q = params.search.toLowerCase()
    list = list.filter((m) => m.email_address.toLowerCase().includes(q))
  }
  if (params.status === 'paused') list = list.filter((m) => m.paused)
  else if (params.status === 'throttled')
    list = list.filter((m) => !!m.throttled_until && new Date(m.throttled_until).getTime() > Date.now())
  else if (params.status === 'active')
    list = list.filter((m) => !m.paused && !(m.throttled_until && new Date(m.throttled_until).getTime() > Date.now()))

  list = applySort(list, params.sort, {
    pending_count: (m) => m.pending_count,
    sent_last_hour: (m) => m.sent_last_hour,
    hourly_limit: (m) => m.hourly_limit,
    email_address: (m) => m.email_address,
  })

  const total = list.length
  const start = (params.page - 1) * params.limit
  return { items: list.slice(start, start + params.limit), page: params.page, limit: params.limit, total }
}

/**
 * Looks up a single mailbox by id.
 * @param id - Mailbox id.
 * @returns The mailbox, or `null` if no mailbox has that id.
 */
export function getMailbox(id: string) {
  return mailboxes.get(id) ?? null
}

/**
 * Updates a mailbox's paused state and records a pause/unpause event if it actually changed.
 * @param id - Mailbox id.
 * @param patch - Fields to update (currently only `paused`).
 * @returns The updated mailbox, or `null` if no mailbox has that id.
 */
export function patchMailbox(id: string, patch: Partial<Pick<Mailbox, 'paused'>>) {
  const mailbox = mailboxes.get(id)
  if (!mailbox) return null
  if (typeof patch.paused === 'boolean' && patch.paused !== mailbox.paused) {
    mailbox.paused = patch.paused
    pushEvent(id, patch.paused ? 'mailbox.paused' : 'mailbox.unpaused', { by: 'operator' })
  }
  return mailbox
}

/**
 * True aggregate over every queued (pending or retrying) email for a mailbox -- every
 * matching row, not a page of them -- plus a top-N "next up" recipient list. Mirrors
 * the real backend's GROUP BY endpoint so dev/test behavior matches production.
 * @param mailboxId - Mailbox id.
 * @param recipientLimit - How many "next up" recipients to include.
 * @returns `{ total, by_campaign, recipients }`.
 */
export function getMailboxQueueSummary(mailboxId: string, recipientLimit: number) {
  const queued = emailOrder
    .map((id) => emails.get(id)!)
    .filter((e) => e.mailbox_id === mailboxId && (e.status === 'pending' || e.status === 'retrying'))

  const counts = new Map<string, number>()
  for (const e of queued) counts.set(e.campaign_id, (counts.get(e.campaign_id) ?? 0) + 1)
  const by_campaign = [...counts.entries()]
    .map(([campaign_id, count]) => ({ campaign_id, count }))
    .sort((a, b) => b.count - a.count || a.campaign_id.localeCompare(b.campaign_id))

  const recipients = [...queued]
    .sort((a, b) => soonestTimestamp(a) - soonestTimestamp(b))
    .slice(0, recipientLimit)

  return { total: queued.length, by_campaign, recipients }
}

/**
 * The time an email is next due to attempt sending: its retry time if it's retrying,
 * otherwise its original schedule time.
 * @param email - The email to inspect.
 * @returns Epoch milliseconds for the relevant timestamp.
 */
function soonestTimestamp(email: Email): number {
  return email.status === 'retrying' && email.next_retry_at
    ? new Date(email.next_retry_at).getTime()
    : new Date(email.scheduled_at).getTime()
}

/**
 * Filters, sorts, and paginates emails.
 * @param params - Page/limit, an optional recipient/subject search term, status/mailbox/campaign
 * filters, and sort key.
 * @returns A paginated envelope of matching emails.
 */
export function listEmails(params: {
  page: number
  limit: number
  search?: string
  status?: string
  mailbox_id?: string
  campaign_id?: string
  sort?: string
}) {
  const ids = emailOrder
  let list: Email[]

  if (params.mailbox_id || params.campaign_id || params.status || params.search) {
    list = ids.map((id) => emails.get(id)!).filter((e) => {
      if (params.mailbox_id && e.mailbox_id !== params.mailbox_id) return false
      if (params.campaign_id && e.campaign_id !== params.campaign_id) return false
      // "queued" is a synthetic filter value (never a real row status) meaning
      // pending or retrying combined -- the same definition getMailboxQueueSummary
      // uses -- so links into this list can mean the same thing the summary card does.
      if (params.status === 'queued') {
        if (e.status !== 'pending' && e.status !== 'retrying') return false
      } else if (params.status && e.status !== params.status) {
        return false
      }
      if (params.search) {
        const q = params.search.toLowerCase()
        if (!e.recipient.toLowerCase().includes(q) && !e.subject.toLowerCase().includes(q)) return false
      }
      return true
    })
  } else {
    list = ids.map((id) => emails.get(id)!)
  }

  list = applySort(list, params.sort, {
    scheduled_at: (e) => new Date(e.scheduled_at).getTime(),
    attempts: (e) => e.attempts,
    status: (e) => e.status,
    next_retry_at: (e) => (e.next_retry_at ? new Date(e.next_retry_at).getTime() : Infinity),
  })

  const total = list.length
  const start = (params.page - 1) * params.limit
  return { items: list.slice(start, start + params.limit), page: params.page, limit: params.limit, total }
}

/**
 * Looks up a single email by id.
 * @param id - Email id.
 * @returns The email, or `null` if no email has that id.
 */
export function getEmail(id: string) {
  return emails.get(id) ?? null
}

/**
 * Requests a manual retry of an email, moving it to "retrying" and bumping its attempt count.
 * @param id - Email id.
 * @returns `{ ok: true, email }` on success, or `{ ok: false, reason }` if the email doesn't
 * exist or is already sent/sending.
 */
export function retryEmail(id: string): { ok: true; email: Email } | { ok: false; reason: string } {
  const email = emails.get(id)
  if (!email) return { ok: false, reason: 'not_found' }
  if (email.status === 'sent' || email.status === 'sending') {
    return { ok: false, reason: `Cannot retry an email that is currently "${email.status}"` }
  }

  adjustCampaignCount(email.campaign_id, email.status, -1)
  adjustMailboxPending(email.mailbox_id, email.status, -1)
  const wasStuck = email.status
  email.status = 'retrying'
  email.attempts += 1
  email.last_error = null
  email.next_retry_at = new Date(Date.now() + faker.number.int({ min: 4_000, max: 12_000 })).toISOString()
  adjustCampaignCount(email.campaign_id, 'retrying', 1)
  adjustMailboxPending(email.mailbox_id, 'retrying', 1)

  pushEvent(id, 'email.retry_requested', { by: 'operator', previous_status: wasStuck, attempt: email.attempts })
  return { ok: true, email }
}

/**
 * Lists all campaigns.
 * @returns Every campaign in the store.
 */
export function listCampaigns() {
  return [...campaigns.values()]
}

/**
 * Lists recent events, most recent first, optionally scoped to one entity.
 * @param params - Optional entity id filter and result limit (defaults to 100).
 * @returns The most recent matching events, newest first.
 */
export function listEvents(params: { entity_id?: string; limit?: number }) {
  let list = events
  if (params.entity_id) list = list.filter((e) => e.entity_id === params.entity_id)
  const limit = params.limit ?? 100
  return list.slice(Math.max(0, list.length - limit)).reverse()
}

// ---- helpers -----------------------------------------------------------

/**
 * Sorts a list by a `sort` key (a `-` prefix means descending), using the matching accessor.
 * @param list - Items to sort.
 * @param sort - Sort key, optionally `-`-prefixed for descending. No-op if omitted or unknown.
 * @param accessors - Map of sort key to a function extracting the comparable value from an item.
 * @returns A new, sorted array; the input is left untouched.
 */
function applySort<T>(list: T[], sort: string | undefined, accessors: Record<string, (item: T) => string | number>): T[] {
  if (!sort) return list
  const desc = sort.startsWith('-')
  const key = desc ? sort.slice(1) : sort
  const accessor = accessors[key]
  if (!accessor) return list
  const copy = [...list]
  copy.sort((a, b) => {
    const av = accessor(a)
    const bv = accessor(b)
    if (av === bv) return 0
    const cmp = av > bv ? 1 : -1
    return desc ? -cmp : cmp
  })
  return copy
}

/**
 * Adjusts a mailbox's `pending_count` (emails still queued: pending or retrying).
 * No-op for any other status.
 * @param mailboxId - Mailbox id.
 * @param status - The email status the count change is associated with.
 * @param delta - Amount to add (negative to subtract).
 * @returns Nothing; mutates the mailbox in place, floored at 0.
 */
function adjustMailboxPending(mailboxId: string, status: EmailStatus, delta: number) {
  if (status !== 'pending' && status !== 'retrying') return
  const mailbox = mailboxes.get(mailboxId)
  if (mailbox) mailbox.pending_count = Math.max(0, mailbox.pending_count + delta)
}

/**
 * Adjusts a campaign's per-status email count.
 * @param campaignId - Campaign id.
 * @param status - Which status counter to adjust.
 * @param delta - Amount to add (negative to subtract).
 * @returns Nothing; mutates the campaign in place, floored at 0.
 */
function adjustCampaignCount(campaignId: string, status: EmailStatus, delta: number) {
  const campaign = campaigns.get(campaignId)
  if (!campaign) return
  if (status === 'pending') campaign.pending = Math.max(0, campaign.pending + delta)
  else if (status === 'sending') campaign.sending = Math.max(0, campaign.sending + delta)
  else if (status === 'retrying') campaign.retrying = Math.max(0, campaign.retrying + delta)
  else if (status === 'sent') campaign.sent = Math.max(0, campaign.sent + delta)
  else if (status === 'dead') campaign.dead = Math.max(0, campaign.dead + delta)
}

// ---- live simulation -----------------------------------------------------

/**
 * Advances a random slice of state each tick: pending -> sending -> sent/failed,
 * failed/retrying -> dead or sent, and mailboxes drifting in/out of throttle.
 * @returns Nothing; mutates emails and mailboxes in place and records events.
 */
export function tickSimulation() {
  const now = Date.now()
  const sampleSize = 25
  const ids = emailOrder
  for (let i = 0; i < sampleSize; i++) {
    const id = ids[Math.floor(Math.random() * ids.length)]
    const email = emails.get(id)
    if (!email) continue

    if (email.status === 'pending' && new Date(email.scheduled_at).getTime() <= now) {
      adjustCampaignCount(email.campaign_id, 'pending', -1)
      adjustMailboxPending(email.mailbox_id, 'pending', -1)
      email.status = 'sending'
      adjustCampaignCount(email.campaign_id, 'sending', 1)
      pushEvent(id, 'email.sending', {})
    } else if (email.status === 'sending') {
      const mailbox = mailboxes.get(email.mailbox_id)
      const throttled = mailbox && !mailbox.paused && !isThrottled(mailbox) && Math.random() < 0.85
      adjustCampaignCount(email.campaign_id, 'sending', -1)
      if (throttled) {
        email.status = 'sent'
        email.last_error = null
        if (mailbox) mailbox.sent_last_hour += 1
        adjustCampaignCount(email.campaign_id, 'sent', 1)
        pushEvent(id, 'email.sent', {})
      } else {
        email.status = 'failed'
        email.last_error = faker.helpers.arrayElement(ERROR_MESSAGES)
        adjustCampaignCount(email.campaign_id, 'failed', 1)
        pushEvent(id, 'email.failed', { error: email.last_error })
      }
    } else if (
      (email.status === 'retrying' || email.status === 'failed') &&
      email.next_retry_at &&
      new Date(email.next_retry_at).getTime() <= now
    ) {
      if (email.attempts >= 5) {
        adjustCampaignCount(email.campaign_id, email.status, -1)
        adjustMailboxPending(email.mailbox_id, email.status, -1)
        email.status = 'dead'
        email.next_retry_at = null
        adjustCampaignCount(email.campaign_id, 'dead', 1)
        pushEvent(id, 'email.dead', { attempts: email.attempts })
      } else if (Math.random() < 0.55) {
        adjustCampaignCount(email.campaign_id, email.status, -1)
        adjustMailboxPending(email.mailbox_id, email.status, -1)
        email.status = 'sent'
        email.last_error = null
        email.next_retry_at = null
        adjustCampaignCount(email.campaign_id, 'sent', 1)
        pushEvent(id, 'email.sent', { after_retry: true })
      } else {
        email.attempts += 1
        email.last_error = faker.helpers.arrayElement(ERROR_MESSAGES)
        email.next_retry_at = new Date(now + faker.number.int({ min: 10_000, max: 60_000 })).toISOString()
        pushEvent(id, 'email.retry_failed', { attempt: email.attempts, error: email.last_error })
      }
    }
  }

  for (const mailbox of mailboxes.values()) {
    if (mailbox.throttled_until && new Date(mailbox.throttled_until).getTime() <= now) {
      mailbox.throttled_until = null
      pushEvent(mailbox.id, 'mailbox.unthrottled', {})
    }
    if (!isThrottled(mailbox) && mailbox.sent_last_hour >= mailbox.hourly_limit && Math.random() < 0.3) {
      mailbox.throttled_until = new Date(now + faker.number.int({ min: 60_000, max: 20 * 60_000 })).toISOString()
      pushEvent(mailbox.id, 'mailbox.throttled', { hourly_limit: mailbox.hourly_limit })
    }
    if (Math.random() < 0.4) mailbox.sent_last_hour = Math.max(0, mailbox.sent_last_hour - 1)
  }
}

/**
 * Checks whether a mailbox's throttle is currently in effect.
 * @param mailbox - The mailbox to check.
 * @returns `true` if `throttled_until` is set and still in the future.
 */
function isThrottled(mailbox: Mailbox) {
  return !!mailbox.throttled_until && new Date(mailbox.throttled_until).getTime() > Date.now()
}
