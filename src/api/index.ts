import type { z } from 'zod'
import { API_BASE_URL, DEFAULT_TIMEOUT_MS } from '@/common/constants'
import {
  CampaignSchema,
  EmailSchema,
  EventSchema,
  MailboxQueueSummarySchema,
  MailboxSchema,
  StatsSchema,
  makePaginatedSchema,
  type Mailbox,
} from '@/types/domain'
import type { ListParams, RequestOptions } from '@/types/api'

export { API_BASE_URL }

export class ApiError extends Error {
  kind: 'network' | 'timeout' | 'client' | 'server' | 'parse'
  status?: number
  cause?: unknown

  constructor(kind: ApiError['kind'], message: string, status?: number, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.cause = options?.cause
  }
}

/**
 * Resolves after a delay.
 * @param ms - Delay in milliseconds.
 * @returns A promise that resolves once the delay elapses.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Performs a single fetch attempt with a timeout and normalized errors. Does not retry.
 * @param path - Request path, appended to {@link API_BASE_URL}.
 * @param opts - Method, body, abort signal, and timeout for the request.
 * @returns The parsed JSON response body, or `null` for a 204 response.
 * @throws {ApiError} On a non-OK response, a timeout/abort, or a network failure.
 */
async function rawRequest(path: string, opts: RequestOptions): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )

  // Let an externally-supplied signal (e.g. query cancellation) abort too.
  const onExternalAbort = () => controller.abort()
  opts.signal?.addEventListener('abort', onExternalAbort)

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })

    if (!res.ok) {
      const kind = res.status >= 500 ? 'server' : 'client'
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = (body?.message as string) ?? detail
      } catch {
        // no JSON body — fine, keep statusText
      }
      throw new ApiError(kind, detail, res.status)
    }

    if (res.status === 204) return null
    return await res.json()
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('timeout', 'Request timed out or was cancelled')
    }
    throw new ApiError('network', 'Network request failed', undefined, {
      cause: err,
    })
  } finally {
    clearTimeout(timeout)
    opts.signal?.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * Wraps {@link rawRequest} with retry/backoff for retryable failures.
 * @param path - Request path, appended to {@link API_BASE_URL}.
 * @param opts - Method, body, signal, timeout, and retry count (defaults to 2 for GET, 0 otherwise).
 * @returns The parsed JSON response body, or `null` for a 204 response.
 * @throws {ApiError} If the final attempt still fails, or the failure isn't retryable.
 */
async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const method = opts.method ?? 'GET'
  const maxRetries = opts.retries ?? (method === 'GET' ? 2 : 0)

  let attempt = 0
  for (;;) {
    try {
      return await rawRequest(path, opts)
    } catch (err) {
      const retryable =
        err instanceof ApiError && (err.kind === 'network' || err.kind === 'timeout' || err.kind === 'server')
      if (!retryable || attempt >= maxRetries) throw err
      await sleep(2 ** attempt * 300 + Math.random() * 150)
      attempt += 1
    }
  }
}

/**
 * Issues a GET request and validates the response against a zod schema.
 * @param path - Request path, appended to {@link API_BASE_URL}.
 * @param schema - Zod schema the response body is parsed against.
 * @param signal - Optional abort signal (e.g. from query cancellation).
 * @returns The parsed, schema-validated response data.
 * @throws {ApiError} If the request fails or the response doesn't match `schema`.
 */
export async function get<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const data = await request(path, { method: 'GET', signal })
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError('parse', `Response for ${path} did not match expected shape`, undefined, {
      cause: parsed.error,
    })
  }
  return parsed.data
}

/**
 * Issues a POST/PATCH request and validates the response against a zod schema. Never auto-retried.
 * @param path - Request path, appended to {@link API_BASE_URL}.
 * @param schema - Zod schema the response body is parsed against.
 * @param init - HTTP method, optional request body, and optional abort signal.
 * @returns The parsed, schema-validated response data.
 * @throws {ApiError} If the request fails or the response doesn't match `schema`.
 */
export async function mutate<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: { method: 'POST' | 'PATCH'; body?: unknown; signal?: AbortSignal },
): Promise<z.infer<S>> {
  const data = await request(path, { ...init, retries: 0 })
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError('parse', `Response for ${path} did not match expected shape`, undefined, {
      cause: parsed.error,
    })
  }
  return parsed.data
}

/**
 * Serializes an object into a URL query string, dropping `undefined`, `null`, and empty-string values.
 * @param params - Key/value pairs to serialize.
 * @returns A query string beginning with `?`, or `''` if no params remain.
 */
export function buildQuery(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined | null][]) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

const PaginatedEmails = makePaginatedSchema(EmailSchema)
const PaginatedMailboxes = makePaginatedSchema(MailboxSchema)

export const api = {
  stats: (signal?: AbortSignal) => get(`/stats`, StatsSchema, signal),

  mailboxes: (params: ListParams = {}, signal?: AbortSignal) =>
    get(`/mailboxes${buildQuery(params)}`, PaginatedMailboxes, signal),

  mailbox: (id: string, signal?: AbortSignal) =>
    get(`/mailboxes/${id}`, MailboxSchema, signal),

  /** Only `paused` can currently be patched. */
  updateMailbox: (id: string, patch: Partial<Pick<Mailbox, 'paused'>>, signal?: AbortSignal) =>
    mutate(`/mailboxes/${id}`, MailboxSchema, { method: 'PATCH', body: patch, signal }),

  /** True server-side aggregate (all queued rows, not a sample) plus a top-N "next up" recipient list. */
  mailboxQueueSummary: (id: string, params: { recipient_limit?: number } = {}, signal?: AbortSignal) =>
    get(`/mailboxes/${id}/queue-summary${buildQuery(params)}`, MailboxQueueSummarySchema, signal),

  emails: (params: ListParams = {}, signal?: AbortSignal) =>
    get(`/emails${buildQuery(params)}`, PaginatedEmails, signal),

  email: (id: string, signal?: AbortSignal) => get(`/emails/${id}`, EmailSchema, signal),

  /** Moves the email's status to "retrying". */
  retryEmail: (id: string, signal?: AbortSignal) =>
    mutate(`/emails/${id}/retry`, EmailSchema, { method: 'POST', signal }),

  /** Not paginated — returns the full list. */
  campaigns: (signal?: AbortSignal) => get(`/campaigns`, CampaignSchema.array(), signal),

  events: (params: { entity_id?: string; limit?: number } = {}, signal?: AbortSignal) =>
    get(`/events${buildQuery(params)}`, EventSchema.array(), signal),
}
