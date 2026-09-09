// Centralized app constants. Group related values together and export everything
// from this single entry point so call sites import from '@/common/constants'.

// --- API ---
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
export const DEFAULT_TIMEOUT_MS = 10_000

// --- Polling intervals (ms) ---
// The real-time SSE push channel (src/queries/useEventStream.ts) makes polling
// just a backstop for a dead connection, so these stay slow.
export const EMAILS_LIST_POLL_MS = 5 * 60_000 // 5 min
export const EMAIL_DETAIL_ACTIVE_POLL_MS = 45_000 // 45 sec
export const EMAIL_DETAIL_IDLE_POLL_MS = 5 * 60_000 // 5 min
export const MAILBOXES_LIST_POLL_MS = 5 * 60_000 // 5 min
export const MAILBOX_DETAIL_POLL_MS = 3 * 60_000 // 3 min
export const STATS_POLL_MS = 5 * 60_000 // 5 min
export const EVENTS_POLL_MS = 3 * 60_000 // 3 min
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
