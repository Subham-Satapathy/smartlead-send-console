import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { usePageVisible } from '@/utils'
import { CAMPAIGNS_STALE_TIME_MS, EVENTS_PER_ENTITY_LIMIT, EVENTS_POLL_MS, STATS_POLL_MS } from '@/common/constants'
import { queryKeys } from './keys'

/**
 * Fetches aggregate stats, polling in the background while the tab is visible.
 * @returns A React Query result for the stats object.
 */
export function useStats() {
  const visible = usePageVisible()
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: ({ signal }) => api.stats(signal),
    refetchInterval: visible ? STATS_POLL_MS : false,
  })
}

/**
 * Fetches the full list of campaigns.
 * @returns A React Query result for the campaign list.
 */
export function useCampaigns() {
  return useQuery({
    queryKey: queryKeys.campaigns,
    queryFn: ({ signal }) => api.campaigns(signal),
    staleTime: CAMPAIGNS_STALE_TIME_MS,
  })
}

/**
 * Fetches recent events for one entity, polling in the background while the tab is visible.
 * @param entityId - Mailbox or email id to scope events to, or `undefined` to skip the query.
 * @returns A React Query result for the entity's recent events.
 */
export function useEvents(entityId: string | undefined) {
  const visible = usePageVisible()
  return useQuery({
    queryKey: queryKeys.events(entityId),
    queryFn: ({ signal }) => api.events({ entity_id: entityId, limit: EVENTS_PER_ENTITY_LIMIT }, signal),
    enabled: !!entityId,
    refetchInterval: visible ? EVENTS_POLL_MS : false,
  })
}
