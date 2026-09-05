// Centralized app constants. Group related values together and export everything
// from this single entry point so call sites import from '@/common/constants'.

// --- API ---
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
export const DEFAULT_TIMEOUT_MS = 10_000

// --- Feature flags ---
// True when running against the in-browser mock backend rather than a real API.
export const IS_MOCK = import.meta.env.VITE_USE_MOCK !== 'false' && !import.meta.env.VITE_API_BASE_URL
// True when the real-time SSE push channel (src/queries/useEventStream.ts) is
// available. Query hooks use this to pick their polling interval: fast
// without push, slow (bounded-staleness fallback) with it.
export const HAS_EVENT_STREAM = !IS_MOCK

// --- Polling intervals (ms) ---
// With a push channel, polling is just a backstop for a dead SSE connection,
// so it can be slow; without one it's the only update mechanism, so it stays fast.
export const EMAILS_LIST_POLL_MS = HAS_EVENT_STREAM ? 5 * 60_000 : 8_000 // 5 min / 8 sec
export const EMAIL_DETAIL_ACTIVE_POLL_MS = HAS_EVENT_STREAM ? 45_000 : 4_000 // 45 sec / 4 sec
export const EMAIL_DETAIL_IDLE_POLL_MS = HAS_EVENT_STREAM ? 5 * 60_000 : 12_000 // 5 min / 12 sec
export const MAILBOXES_LIST_POLL_MS = HAS_EVENT_STREAM ? 5 * 60_000 : 8_000 // 5 min / 8 sec
export const MAILBOX_DETAIL_POLL_MS = HAS_EVENT_STREAM ? 3 * 60_000 : 5_000 // 3 min / 5 sec
export const STATS_POLL_MS = HAS_EVENT_STREAM ? 5 * 60_000 : 10_000 // 5 min / 10 sec
export const EVENTS_POLL_MS = HAS_EVENT_STREAM ? 3 * 60_000 : 5_000 // 3 min / 5 sec
// Batches SSE-driven cache invalidations within this window into one flush,
// to avoid a refetch per event during a send burst.
export const EVENT_STREAM_FLUSH_INTERVAL_MS = 1_000

// --- Cache staleness (ms) ---
export const MAILBOX_OPTIONS_STALE_TIME_MS = 5 * 60_000 // 5 min
export const CAMPAIGNS_STALE_TIME_MS = 60_000 // 1 min

// --- UI timing (ms) ---
export const SEARCH_DEBOUNCE_MS = 300
export const RELATIVE_TIME_TICK_MS = 30_000

// --- Pagination / limits ---
export const DEFAULT_PAGE_SIZE = 50
export const MAILBOX_OPTIONS_LIMIT = 200
export const EVENTS_PER_ENTITY_LIMIT = 50
// How many "next up" recipients the mailbox detail page's queue summary shows.
export const RECIPIENT_PREVIEW_LIMIT = 10

// --- Domain ---
export const RETRYABLE_EMAIL_STATUSES = new Set(['failed', 'dead', 'retrying'])
