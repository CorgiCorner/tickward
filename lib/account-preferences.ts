import { z } from "zod"

import { countUpPolicySchema, DEFAULT_COUNT_UP_POLICY } from "@/lib/count-up-policy"
import { notificationSoundSchema, timezoneSchema } from "@/lib/schemas/timer"

export const accountPreferencesRecordSchema = z.object({
  object: z.literal("account_preferences"),
  default_timezone: timezoneSchema.nullable(),
  email_reminders: z.boolean(),
  full_page_alarm: z.boolean(),
  in_app_notifications: z.boolean(),
  notification_sound: notificationSoundSchema,
  count_up_policy: countUpPolicySchema.default(DEFAULT_COUNT_UP_POLICY),
  count_up_intro_dismissed: z.boolean().default(false),
})

export const accountPreferencesPatchSchema = z
  .object({
    default_timezone: timezoneSchema.nullable().optional(),
    email_reminders: z.boolean().optional(),
    full_page_alarm: z.boolean().optional(),
    in_app_notifications: z.boolean().optional(),
    notification_sound: notificationSoundSchema.optional(),
    count_up_policy: countUpPolicySchema.optional(),
    count_up_intro_dismissed: z.boolean().optional(),
  })
  .strict()

export type AccountPreferencesPatch = z.infer<typeof accountPreferencesPatchSchema>
export type AccountPreferencesRecord = z.infer<typeof accountPreferencesRecordSchema>

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferencesRecord = {
  object: "account_preferences",
  default_timezone: null,
  email_reminders: false,
  full_page_alarm: true,
  in_app_notifications: true,
  notification_sound: "polite",
  count_up_policy: DEFAULT_COUNT_UP_POLICY,
  count_up_intro_dismissed: false,
}
