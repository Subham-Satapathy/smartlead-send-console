export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  /** GET requests are safe to retry; mutations default to no retry. */
  retries?: number
}

export interface ListParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  mailbox_id?: string
  campaign_id?: string
  sort?: string
}
