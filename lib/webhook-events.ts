import { z } from "zod"

export const WEBHOOK_EVENT_TYPES = [
  "project.created",
  "project.updated",
  "project.deleted",
  "timer.created",
  "timer.updated",
  "timer.archived",
  "timer.restored",
  "timer.deleted",
  "timer.ended",
  "timer.milestone",
  "share.created",
  "share.deleted",
] as const

export const WEBHOOK_EVENT_VERSION = "2026-06-10"
export const WEBHOOK_TEST_EVENT_TYPE = "webhook.test"

export const WEBHOOK_ENDPOINT_STATUSES = ["active", "disabled"] as const
export const WEBHOOK_EVENT_STATUSES = ["pending", "processing", "completed", "failed", "cancelled"] as const
export const WEBHOOK_DELIVERY_STATUSES = ["pending", "processing", "delivered", "failed"] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]
export type WebhookDeliveryEventType = WebhookEventType | typeof WEBHOOK_TEST_EVENT_TYPE
export type WebhookEndpointStatus = (typeof WEBHOOK_ENDPOINT_STATUSES)[number]
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number]
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number]

export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES)
export const webhookDeliveryEventTypeSchema = z.union([webhookEventTypeSchema, z.literal(WEBHOOK_TEST_EVENT_TYPE)])
export const webhookEndpointStatusSchema = z.enum(WEBHOOK_ENDPOINT_STATUSES)

export const webhookEndpointNameSchema = z.string().trim().min(1).max(80)
export const webhookEndpointUrlSchema = z
  .url()
  .trim()
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1"
    } catch {
      return false
    }
  }, "Webhook URL must use HTTPS, localhost, or 127.0.0.1.")

export const webhookEventTypesSchema = z.array(webhookEventTypeSchema).min(1).max(WEBHOOK_EVENT_TYPES.length)

export const webhookEventPayloadSchema = z.object({
  object: z.literal("event"),
  id: z.string().min(1),
  type: webhookDeliveryEventTypeSchema,
  created: z.string().min(1),
  environment: z.string().min(1).max(64),
  event_version: z.literal(WEBHOOK_EVENT_VERSION),
  data: z.object({
    object: z.looseObject({
      id: z.string().min(1),
      object: z.string().min(1),
      project_id: z.string().optional(),
      project_name: z.string().optional(),
      share_id: z.string().optional(),
      timer_id: z.string().optional(),
      timer_label: z.string().optional(),
    }),
  }),
})

export type WebhookEndpointPublicRecord = {
  id: string
  object: "webhook_endpoint"
  name: string
  url: string
  event_types: WebhookEventType[]
  status: WebhookEndpointStatus
  failure_count: number
  created_at: string
  updated_at: string
  disabled_at: string | null
  last_delivered_at: string | null
  last_failed_at: string | null
}

export type CreatedWebhookEndpointRecord = WebhookEndpointPublicRecord & {
  signing_secret: string
}

export type WebhookDeliveryPublicRecord = {
  id: string
  object: "webhook_delivery"
  endpoint_id: string
  event_id: string
  status: WebhookDeliveryStatus
  attempt_count: number
  next_attempt_at: string | null
  last_attempt_at: string | null
  delivered_at: string | null
  failed_at: string | null
  response_status: number | null
  error: string | null
  created_at: string
  updated_at: string
}

export type WebhookEventPayload = {
  object: "event"
  id: string
  type: WebhookDeliveryEventType
  created: string
  environment: string
  event_version: typeof WEBHOOK_EVENT_VERSION
  data: {
    object: {
      id: string
      object: string
      project_id?: string
      project_name?: string
      share_id?: string
      timer_id?: string
      timer_label?: string
    } & Record<string, unknown>
  }
}

export function normalizeWebhookEventTypes(value: unknown): WebhookEventType[] {
  if (!Array.isArray(value)) return []
  const types = new Set<WebhookEventType>()
  for (const item of value) {
    const parsed = webhookEventTypeSchema.safeParse(item)
    if (parsed.success) types.add(parsed.data)
  }
  return [...types]
}

export function normalizeWebhookEndpointStatus(value: unknown): WebhookEndpointStatus {
  return webhookEndpointStatusSchema.safeParse(value).success ? (value as WebhookEndpointStatus) : "disabled"
}

export function webhookEventTypeLabel(type: WebhookEventType) {
  return type.replace(".", " ")
}
