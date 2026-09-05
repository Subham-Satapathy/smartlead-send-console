import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListParams } from '@/types/api'
import { usePageVisible } from '@/utils'
import { EMAILS_LIST_POLL_MS, EMAIL_DETAIL_ACTIVE_POLL_MS, EMAIL_DETAIL_IDLE_POLL_MS } from '@/common/constants'
import type { Email } from '@/types/domain'
import { queryKeys } from './keys'

/**
 * Fetches a paginated, filtered list of emails, polling in the background while the tab is visible.
 * @param params - Page, limit, search, status, mailbox/campaign filters, and sort.
 * @returns A React Query result for the paginated email list.
 */
export function useEmails(params: ListParams) {
  const visible = usePageVisible()
  return useQuery({
    queryKey: queryKeys.emails.list(params),
    queryFn: ({ signal }) => api.emails(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: visible ? EMAILS_LIST_POLL_MS : false,
  })
}

/**
 * Fetches a single email, polling faster while it's actively sending/retrying.
 * @param id - Email id, or `undefined` to skip the query.
 * @returns A React Query result for the email.
 */
export function useEmail(id: string | undefined) {
  const visible = usePageVisible()
  return useQuery({
    queryKey: queryKeys.emails.detail(id ?? ''),
    queryFn: ({ signal }) => api.email(id!, signal),
    enabled: !!id,
    // Poll faster while the email is actively in flight so "confirming..."
    // resolves to a real terminal state without the operator refreshing.
    refetchInterval: (query) => {
      if (!visible) return false
      const status = query.state.data?.status
      return status === 'sending' || status === 'retrying' ? EMAIL_DETAIL_ACTIVE_POLL_MS : EMAIL_DETAIL_IDLE_POLL_MS
    },
  })
}

/**
 * Requests a manual retry of an email. Optimistically flips its status to "retrying"
 * everywhere it's cached (list pages + detail), rolling back on failure. The eventual
 * sent/failed transition arrives via the next poll, not this mutation.
 * @returns A React Query mutation; call `.mutate({ id })` to trigger a retry.
 */
export function useRetryEmail() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.retryEmail(id),

    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.emails.all })

      const previousDetail = queryClient.getQueryData<Email>(queryKeys.emails.detail(id))
      const previousLists = queryClient.getQueriesData<{ items: Email[] }>({ queryKey: queryKeys.emails.lists() })

      queryClient.setQueryData<Email | undefined>(queryKeys.emails.detail(id), (old) =>
        old ? { ...old, status: 'retrying' } : old,
      )
      // queryKeys.emails.lists() can't match the detail query (see keys.ts), but the
      // Array.isArray check stays as a belt-and-suspenders guard against a malformed entry.
      queryClient.setQueriesData<{ items: Email[] } | undefined>({ queryKey: queryKeys.emails.lists() }, (old) => {
        if (!old || !Array.isArray(old.items)) return old
        return { ...old, items: old.items.map((e) => (e.id === id ? { ...e, status: 'retrying' as const } : e)) }
      })

      return { previousDetail, previousLists }
    },

    onError: (_err, { id }, context) => {
      if (context?.previousDetail) queryClient.setQueryData(queryKeys.emails.detail(id), context.previousDetail)
      context?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },

    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.emails.detail(updated.id), updated)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    },
  })
}
