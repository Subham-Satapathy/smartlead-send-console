import { z } from 'zod'

export const EmailStatus = z.enum([
  'pending',
  'sending',
  'retrying',
  'sent',
  'failed',
  'dead',
])
export type EmailStatus = z.infer<typeof EmailStatus>

export const EmailSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  mailbox_id: z.string(),
  recipient: z.string(),
  subject: z.string(),
  scheduled_at: z.string(),
  status: EmailStatus,
  attempts: z.number().int().nonnegative(),
  next_retry_at: z.string().nullable(),
  last_error: z.string().nullable(),
})
export type Email = z.infer<typeof EmailSchema>

export const MailboxSchema = z.object({
  id: z.string(),
  email_address: z.string(),
  hourly_limit: z.number().int().nonnegative(),
  sent_last_hour: z.number().int().nonnegative(),
  pending_count: z.number().int().nonnegative(),
  paused: z.boolean(),
  throttled_until: z.string().nullable(),
})
export type Mailbox = z.infer<typeof MailboxSchema>

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  pending: z.number().int().nonnegative(),
  sending: z.number().int().nonnegative(),
  retrying: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  dead: z.number().int().nonnegative(),
})
export type Campaign = z.infer<typeof CampaignSchema>

export const EventSchema = z.object({
  timestamp: z.string(),
  entity_id: z.string(),
  type: z.string(),
  payload: z.record(z.unknown()).default({}),
})
export type Event = z.infer<typeof EventSchema>

export const StatsSchema = z.object({
  mailboxes: z.number().int().nonnegative(),
  campaigns: z.number().int().nonnegative(),
  emails_total: z.number().int().nonnegative(),
  emails_pending: z.number().int().nonnegative(),
  emails_sending: z.number().int().nonnegative(),
  emails_retrying: z.number().int().nonnegative(),
  emails_sent: z.number().int().nonnegative(),
  emails_dead: z.number().int().nonnegative(),
  generated_at: z.string(),
})
export type Stats = z.infer<typeof StatsSchema>

export const MailboxQueueSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  by_campaign: z.array(
    z.object({
      campaign_id: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  recipients: z.array(EmailSchema),
})
export type MailboxQueueSummary = z.infer<typeof MailboxQueueSummarySchema>

export interface Paginated<T> {
  items: T[]
  page: number
  limit: number
  total: number
}

/**
 * Builds a zod schema for a paginated list envelope around a given item schema.
 * @param item - Schema for a single item in the `items` array.
 * @returns A schema validating `{ items, page, limit, total }`.
 */
export function makePaginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  })
}
