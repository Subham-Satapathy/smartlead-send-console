import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListParams } from '@/types/api'
import { usePageVisible } from '@/utils'
import {
  MAILBOXES_LIST_POLL_MS,
  MAILBOX_DETAIL_POLL_MS,
  MAILBOX_OPTIONS_LIMIT,
  MAILBOX_OPTIONS_STALE_TIME_MS,
} from '@/common/constants'
import type { Mailbox } from '@/types/domain'
import { queryKeys } from './keys'

/**
 * Fetches a paginated, filtered list of mailboxes, polling in the background while the tab is visible.
 * @param params - Page, limit, search, status filter, and sort.
 * @returns A React Query result for the paginated mailbox list.
 */
export function useMailboxes(params: ListParams) {
  const visible = usePageVisible()
  return useQuery({
    queryKey: queryKeys.mailboxes.list(params),
    queryFn: ({ signal }) => api.mailboxes(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: visible ? MAILBOXES_LIST_POLL_MS : false,
  })
}

/**
 * Fetches an unfiltered list of mailboxes for use in filter dropdowns. Static-ish: no
 * polling, and a long staleTime.
 * @returns A React Query result for up to 200 mailboxes, sorted by email address.
 */
export function useMailboxOptions() {
  return useQuery({
    queryKey: ['mailboxOptions'],
    queryFn: ({ signal }) => api.mailboxes({ page: 1, limit: MAILBOX_OPTIONS_LIMIT, sort: 'email_address' }, signal),
    staleTime: MAILBOX_OPTIONS_STALE_TIME_MS,
  })
}

/**
 * Fetches a single mailbox, polling in the background while the tab is visible.
 * @param id - Mailbox id, or `undefined` to skip the query.
 * @returns A React Query result for the mailbox.
 */
export function useMailbox(id: string | undefined) {
  const visible = usePageVisible()
  return useQuery({
    queryKey: queryKeys.mailboxes.detail(id ?? ''),
    queryFn: ({ signal }) => api.mailbox(id!, signal),
    enabled: !!id,
    refetchInterval: visible ? MAILBOX_DETAIL_POLL_MS : false,
  })
}

/**
 * Fetches a mailbox's queue summary: a true server-side campaign breakdown (every
 * queued row, not a sample) plus a top-N "next up" recipient list.
 * @param id - Mailbox id, or `undefined` to skip the query.
 * @param recipientLimit - How many "next up" recipients to fetch (defaults to 10).
 * @returns A React Query result for the queue summary.
 */
export function useMailboxQueueSummary(id: string | undefined, recipientLimit = 10) {
  const visible = usePageVisible()
  return useQuery({
    queryKey: queryKeys.mailboxes.queueSummary(id ?? ''),
    queryFn: ({ signal }) => api.mailboxQueueSummary(id!, { recipient_limit: recipientLimit }, signal),
    enabled: !!id,
    refetchInterval: visible ? MAILBOX_DETAIL_POLL_MS : false,
  })
}

/**
 * Toggles a mailbox's paused state. Optimistically flips the flag in every cached
 * view (list pages + detail), rolls back on failure, and reconciles with the
 * server's response on success.
 * @returns A React Query mutation; call `.mutate({ id, paused })` to toggle.
 */
export function useToggleMailboxPause() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) => api.updateMailbox(id, { paused }),

    onMutate: async ({ id, paused }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.mailboxes.all })

      const previousDetail = queryClient.getQueryData<Mailbox>(queryKeys.mailboxes.detail(id))
      const previousLists = queryClient.getQueriesData<{ items: Mailbox[] }>({ queryKey: queryKeys.mailboxes.lists() })

      queryClient.setQueryData<Mailbox | undefined>(queryKeys.mailboxes.detail(id), (old) =>
        old ? { ...old, paused } : old,
      )
      // queryKeys.mailboxes.lists() can't match the detail query (see keys.ts), but the
      // Array.isArray check stays as a belt-and-suspenders guard against a malformed entry.
      queryClient.setQueriesData<{ items: Mailbox[] } | undefined>({ queryKey: queryKeys.mailboxes.lists() }, (old) => {
        if (!old || !Array.isArray(old.items)) return old
        return { ...old, items: old.items.map((m) => (m.id === id ? { ...m, paused } : m)) }
      })

      return { previousDetail, previousLists }
    },

    onError: (_err, { id }, context) => {
      if (context?.previousDetail) queryClient.setQueryData(queryKeys.mailboxes.detail(id), context.previousDetail)
      context?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },

    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.mailboxes.detail(updated.id), updated)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.all })
    },
  })
}
