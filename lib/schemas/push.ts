import { z } from "zod"

export const webPushSubscriptionInputSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export type WebPushSubscriptionInputValues = z.input<typeof webPushSubscriptionInputSchema>
