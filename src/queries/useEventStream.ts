import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { API_BASE_URL, EVENT_STREAM_FLUSH_INTERVAL_MS, HAS_EVENT_STREAM } from '@/common/constants'
import type { Mailbox } from '@/types/domain'
import { queryKeys } from './keys'

interface PushedEvent {
  timestamp: string
  entity_id: string
  type: string
  payload: Record<string, unknown> & { mailbox_id?: string }
}

/**
 * Subscribes once, app-wide, to the backend's SSE push channel and
 * invalidates the relevant query cache entries when something changes.
 * Layered on top of each query's own refetchInterval, not a replacement —
 * ordinary polling still bounds staleness if the connection drops. Only
 * used against the real backend; the mock drives its demo via polling.
 * @returns Nothing; the hook only produces side effects (subscribing/invalidating).
 */
export function useEventStream() {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!HAS_EVENT_STREAM) return

    const source = new EventSource(`${API_BASE_URL}/events/stream`)

    let visible = document.visibilityState === 'visible'
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let pendingStats = false
    let pendingEmails = false
    let pendingMailboxes = false
    // Only entities with a currently-mounted query are tracked — during a send
    // burst, thousands of emails can fire an event each, and most have nobody
    // watching their individual timeline or mailbox detail.
    const pendingEntityIds = new Set<string>()
    // Mailbox ids touched by an email event's payload. Fetched and patched
    // into caches individually below, rather than invalidating the whole list.
    const pendingMailboxDetailIds = new Set<string>()

    /**
     * Returns whether any cached query matching `queryKey` currently has an active observer.
     * @param queryKey - The query key (or prefix) to check.
     * @returns `true` if a mounted component is subscribed to a matching query.
     */
    function hasActiveObserver(queryKey: readonly unknown[]) {
      return !!queryClient.getQueryCache().find({ queryKey, type: 'active' })
    }

    /**
     * Returns whether `mailboxId` is currently visible on screen — either its own
     * detail query is mounted, or it appears on a currently active (mounted) page
     * of the mailboxes list. With thousands of mailboxes possible, checking "is the
     * list open at all" isn't enough — most mailboxes touched by a send burst won't
     * be on the one page actually rendered.
     * @param mailboxId - The mailbox id to check.
     * @returns `true` if patching this mailbox's cache would affect something rendered.
     */
    function mailboxIsVisible(mailboxId: string) {
      if (hasActiveObserver(queryKeys.mailboxes.detail(mailboxId))) return true
      return queryClient
        .getQueryCache()
        .findAll({ queryKey: queryKeys.mailboxes.lists(), type: 'active' })
        .some((query) => (query.state.data as { items?: Mailbox[] } | undefined)?.items?.some((m) => m.id === mailboxId))
    }

    /**
     * Applies the batch of pending invalidations/patches accumulated since the last flush.
     * A no-op while the tab is backgrounded — pending state is left intact and applied
     * in one catch-up flush when the tab becomes visible again.
     * @returns Nothing; invalidates or patches query cache entries and resets pending state.
     */
    function flush() {
      flushTimer = null
      if (!visible) return

      if (pendingStats) queryClient.invalidateQueries({ queryKey: queryKeys.stats })
      // .all covers both the list and single-entity detail query.
      if (pendingEmails) queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
      // Full list refresh only for mailbox-level events (pause/unpause);
      // plain send activity patches the affected row directly instead.
      if (pendingMailboxes) queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.all })
      else {
        for (const mailboxId of pendingMailboxDetailIds) {
          // Re-check right before acting, not just at message-arrival time up to
          // EVENT_STREAM_FLUSH_INTERVAL_MS ago — the operator may have navigated away in between,
          // and the arrival-time check only bounds what gets *tracked*, not what's
          // still worth *fetching* by the time we get here.
          if (!mailboxIsVisible(mailboxId)) continue
          queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.queueSummary(mailboxId) })
          queryClient
            .fetchQuery({ queryKey: queryKeys.mailboxes.detail(mailboxId), queryFn: () => api.mailbox(mailboxId) })
            .then((updated) => {
              // queryKeys.mailboxes.lists() can't match the detail query (see keys.ts), but the
              // Array.isArray check stays as a belt-and-suspenders guard against a malformed entry.
              queryClient.setQueriesData<{ items: Mailbox[] } | undefined>({ queryKey: queryKeys.mailboxes.lists() }, (old) => {
                if (!old || !Array.isArray(old.items)) return old
                return { ...old, items: old.items.map((m) => (m.id === mailboxId ? updated : m)) }
              })
            })
            .catch(() => {
              // Next poll or event will catch this row up.
            })
        }
      }
      for (const entityId of pendingEntityIds) {
        // Same re-check: only invalidate if the timeline is still being watched now.
        if (hasActiveObserver(queryKeys.events(entityId))) {
          queryClient.invalidateQueries({ queryKey: queryKeys.events(entityId) })
        }
      }
      pendingStats = false
      pendingEmails = false
      pendingMailboxes = false
      pendingEntityIds.clear()
      pendingMailboxDetailIds.clear()
    }

    source.onmessage = (message) => {
      let event: PushedEvent
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }

      pendingStats = true
      // Only track this entity if its timeline is actually being watched —
      // otherwise a burst of thousands of email (or mailbox) events would grow
      // this set, and the per-entity invalidateQueries loop in flush(), without
      // bound.
      if (hasActiveObserver(queryKeys.events(event.entity_id))) {
        pendingEntityIds.add(event.entity_id)
      }
      if (event.entity_id.startsWith('em_')) {
        pendingEmails = true
        const mailboxId = event.payload?.mailbox_id
        // Same idea, scoped to what's on screen rather than total mailbox count.
        if (mailboxId && mailboxIsVisible(mailboxId)) pendingMailboxDetailIds.add(mailboxId)
      } else if (event.entity_id.startsWith('mb_')) {
        pendingMailboxes = true
      }

      if (!flushTimer) flushTimer = setTimeout(flush, EVENT_STREAM_FLUSH_INTERVAL_MS)
    }

    /**
     * Runs a catch-up flush immediately when the tab regains visibility, instead
     * of waiting for the next SSE message to trigger one.
     * @returns Nothing; flushes pending state as a side effect.
     */
    function onVisibilityChange() {
      visible = document.visibilityState === 'visible'
      if (visible) {
        if (flushTimer) clearTimeout(flushTimer)
        flush()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      source.close()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (flushTimer) clearTimeout(flushTimer)
    }
  }, [queryClient])
}
