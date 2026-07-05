import { z } from "zod"

import { notificationSoundSchema, timezoneSchema } from "@/lib/schemas/timer"

export const accountPreferencesRecordSchema = z.object({
  object: z.literal("account_preferences"),
  default_timezone: timezoneSchema.nullable(),
  email_reminders: z.boolean(),
  full_page_alarm: z.boolean(),
  notification_sound: notificationSoundSchema,
})

export const accountPreferencesPatchSchema = z
  .object({
    default_timezone: timezoneSchema.nullable().optional(),
    email_reminders: z.boolean().optional(),
    full_page_alarm: z.boolean().optional(),
    notification_sound: notificationSoundSchema.optional(),
  })
  .strict()

export type AccountPreferencesPatch = z.infer<typeof accountPreferencesPatchSchema>
export type AccountPreferencesRecord = z.infer<typeof accountPreferencesRecordSchema>

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferencesRecord = {
  object: "account_preferences",
  default_timezone: null,
  email_reminders: false,
  full_page_alarm: true,
  notification_sound: "polite",
}
