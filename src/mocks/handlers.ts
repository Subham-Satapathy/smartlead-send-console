import { HttpResponse, http } from 'msw'
import { randomLatency, shouldFail, sleep } from './chaos'
import * as store from './store'

const BASE = '/api'

/**
 * Parses a URL search param as a number, falling back if it's missing or invalid.
 * @param v - The raw search-param value.
 * @param fallback - Value to use if `v` is missing or not a finite number.
 * @returns The parsed number, or `fallback`.
 */
function num(v: string | null, fallback: number) {
  const n = Number(v)
  return v && Number.isFinite(n) ? n : fallback
}

/**
 * Applies simulated latency, then returns a 500 response if chaos says to fail.
 * @param kind - Whether the request is a read (GET) or a write (mutation).
 * @returns A simulated 500 `Response`, or `null` if the request should proceed normally.
 */
async function chaosGate(kind: 'read' | 'write'): Promise<Response | null> {
  await sleep(randomLatency())
  if (shouldFail(kind)) {
    return HttpResponse.json({ message: 'Simulated upstream failure' }, { status: 500 })
  }
  return null
}

export const handlers = [
  /** Returns aggregate stats, or a simulated failure per {@link chaosGate}. */
  http.get(`${BASE}/stats`, async () => {
    const failure = await chaosGate('read')
    if (failure) return failure
    return HttpResponse.json(store.getStats())
  }),

  /** Returns a paginated, filtered list of mailboxes from the query string. */
  http.get(`${BASE}/mailboxes`, async ({ request }) => {
    const failure = await chaosGate('read')
    if (failure) return failure
    const url = new URL(request.url)
    const result = store.listMailboxes({
      page: num(url.searchParams.get('page'), 1),
      limit: num(url.searchParams.get('limit'), 50),
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
    })
    return HttpResponse.json(result)
  }),

  /** Returns a single mailbox by id, or a 404 if it doesn't exist. */
  http.get(`${BASE}/mailboxes/:id`, async ({ params }) => {
    const failure = await chaosGate('read')
    if (failure) return failure
    const mailbox = store.getMailbox(params.id as string)
    if (!mailbox) return HttpResponse.json({ message: 'Mailbox not found' }, { status: 404 })
    return HttpResponse.json(mailbox)
  }),

  /** Returns a true server-side queue-summary aggregate for one mailbox, or a 404 if it doesn't exist. */
  http.get(`${BASE}/mailboxes/:id/queue-summary`, async ({ params, request }) => {
    const failure = await chaosGate('read')
    if (failure) return failure
    const mailbox = store.getMailbox(params.id as string)
    if (!mailbox) return HttpResponse.json({ message: 'Mailbox not found' }, { status: 404 })
    const url = new URL(request.url)
    const recipientLimit = Math.min(50, Math.max(1, num(url.searchParams.get('recipient_limit'), 10)))
    return HttpResponse.json(store.getMailboxQueueSummary(params.id as string, recipientLimit))
  }),

  /** Patches a mailbox's paused state, or returns a 404 if it doesn't exist. */
  http.patch(`${BASE}/mailboxes/:id`, async ({ params, request }) => {
    const failure = await chaosGate('write')
    if (failure) return failure
    const body = (await request.json()) as { paused?: boolean }
    const updated = store.patchMailbox(params.id as string, body)
    if (!updated) return HttpResponse.json({ message: 'Mailbox not found' }, { status: 404 })
    return HttpResponse.json(updated)
  }),

  /** Returns a paginated, filtered list of emails from the query string. */
  http.get(`${BASE}/emails`, async ({ request }) => {
    const failure = await chaosGate('read')
    if (failure) return failure
    const url = new URL(request.url)
    const result = store.listEmails({
      page: num(url.searchParams.get('page'), 1),
      limit: num(url.searchParams.get('limit'), 50),
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      mailbox_id: url.searchParams.get('mailbox_id') ?? undefined,
      campaign_id: url.searchParams.get('campaign_id') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
    })
    return HttpResponse.json(result)
  }),

  /** Returns a single email by id, or a 404 if it doesn't exist. */
  http.get(`${BASE}/emails/:id`, async ({ params }) => {
    const failure = await chaosGate('read')
    if (failure) return failure
    const email = store.getEmail(params.id as string)
    if (!email) return HttpResponse.json({ message: 'Email not found' }, { status: 404 })
    return HttpResponse.json(email)
  }),

  /** Requests a manual retry of an email; returns a 404/409 if it doesn't exist or can't be retried. */
  http.post(`${BASE}/emails/:id/retry`, async ({ params }) => {
    const failure = await chaosGate('write')
    if (failure) return failure
    const result = store.retryEmail(params.id as string)
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 409
      return HttpResponse.json({ message: result.reason }, { status })
    }
    return HttpResponse.json(result.email)
  }),

  /** Returns the full list of campaigns. */
  http.get(`${BASE}/campaigns`, async () => {
    const failure = await chaosGate('read')
    if (failure) return failure
    return HttpResponse.json(store.listCampaigns())
  }),

  /** Returns recent events, optionally filtered to one entity, from the query string. */
  http.get(`${BASE}/events`, async ({ request }) => {
    const failure = await chaosGate('read')
    if (failure) return failure
    const url = new URL(request.url)
    const result = store.listEvents({
      entity_id: url.searchParams.get('entity_id') ?? undefined,
      limit: num(url.searchParams.get('limit'), 100),
    })
    return HttpResponse.json(result)
  }),
]
