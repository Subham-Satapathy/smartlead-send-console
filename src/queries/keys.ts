import type { ListParams } from '@/types/api'

export const queryKeys = {
  stats: ['stats'] as const,
  campaigns: ['campaigns'] as const,
  mailboxes: {
    /** Root key for every mailbox query (list and detail). Use for cancel/invalidate. */
    all: ['mailboxes'] as const,
    /** Root key for mailbox list queries only — never matches a detail query. */
    lists: () => [...queryKeys.mailboxes.all, 'list'] as const,
    /**
     * Key for a paginated mailbox list query.
     * @param params - The list's filter/sort/page params.
     * @returns A key scoped to those exact params.
     */
    list: (params: ListParams) => [...queryKeys.mailboxes.lists(), params] as const,
    /**
     * Key for a single mailbox's detail query.
     * @param id - Mailbox id.
     * @returns A key scoped to that mailbox.
     */
    detail: (id: string) => [...queryKeys.mailboxes.all, 'detail', id] as const,
    /**
     * Key for a mailbox's queue-summary query (server-side campaign breakdown + top-N recipients).
     * @param id - Mailbox id.
     * @returns A key scoped to that mailbox.
     */
    queueSummary: (id: string) => [...queryKeys.mailboxes.all, 'queueSummary', id] as const,
  },
  emails: {
    /** Root key for every email query (list and detail). Use for cancel/invalidate. */
    all: ['emails'] as const,
    /** Root key for email list queries only — never matches a detail query. */
    lists: () => [...queryKeys.emails.all, 'list'] as const,
    /**
     * Key for a paginated email list query.
     * @param params - The list's filter/sort/page params.
     * @returns A key scoped to those exact params.
     */
    list: (params: ListParams) => [...queryKeys.emails.lists(), params] as const,
    /**
     * Key for a single email's detail query.
     * @param id - Email id.
     * @returns A key scoped to that email.
     */
    detail: (id: string) => [...queryKeys.emails.all, 'detail', id] as const,
  },
  /**
   * Key for an entity's event-history query.
   * @param entityId - Mailbox or email id, or `undefined` for the global stream.
   * @returns A key scoped to that entity (or `'global'`).
   */
  events: (entityId?: string) => ['events', entityId ?? 'global'] as const,
}
