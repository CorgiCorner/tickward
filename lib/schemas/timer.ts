import { z } from "zod"

import { formatMessage } from "@/lib/i18n/messages"
import { NOTIFICATION_SOUNDS } from "@/lib/notification-preferences"

const isoDatePrefixPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const hexColorPattern = /^#[0-9a-fA-F]{6}$/
const safeIdPattern = /^[A-Za-z0-9_-]+$/
const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/
const timeInputPattern = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidImageUrl(value: string) {
  return value.startsWith("https://images.unsplash.com/")
}

export const TIMER_URL_MAX_LENGTH = 2048

// Normalize a user-supplied timer link. Returns "" for blank input, the cleaned
// URL for a valid one, or null when invalid. Only http(s) is allowed (rendering
// a `javascript:`/`data:` href would be an XSS vector), and query strings and
// fragments are stripped per product rules. SQL injection is a non-issue: the
// value is stored in a JSON column via parameterized Prisma writes.
export function normalizeTimerUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  parsed.search = ""
  parsed.hash = ""
  return parsed.toString()
}

export function isValidTimezoneValue(value: string) {
  if (value === "UTC") return true
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      const zones = (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone")
      return zones.includes(value)
    }
  } catch {}
  return /^[A-Za-z_/+-]+$/.test(value)
}

export const colorSchema = z.union([z.literal(""), z.string().regex(hexColorPattern)]).optional()
export const imageUrlSchema = z.string().refine(isValidImageUrl)
export const photoIdSchema = z.string().min(1).max(64).regex(safeIdPattern)
export const targetDateSchema = z.string().regex(isoDatePrefixPattern)
export const timezoneSchema = z.string().refine(isValidTimezoneValue)

export const recurrenceSchema = z.object({
  type: z.enum(["daily", "weekly", "monthly", "yearly"]),
  enabled: z.boolean(),
  lastDay: z.boolean().optional(),
})

export const recurrenceTypeSchema = recurrenceSchema.shape.type

export const notificationSoundSchema = z.enum(NOTIFICATION_SOUNDS)

export const timerNotificationSettingsSchema = z.object({
  enabled: z.boolean(),
})

export const unsplashImageSchema = z.object({
  unsplashId: z.string(),
  url: imageUrlSchema,
  thumbUrl: imageUrlSchema,
  authorName: z.string(),
  authorUrl: z.string(),
})

export type UnsplashImage = z.infer<typeof unsplashImageSchema>

export const timerSchema = z.object({
  id: z.string(),
  label: z.string(),
  targetDate: targetDateSchema,
  timezone: timezoneSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  archivedAt: z.string().optional(),
  color: colorSchema,
  sharedAt: z.string().optional(),
  sourceShareId: z.string().optional(),
  lastSyncAt: z.string().optional(),
  notify: z.boolean().optional(),
  notification: timerNotificationSettingsSchema.optional(),
  pinned: z.boolean().optional(),
  recurrence: recurrenceSchema.optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  spaceId: z.string().optional(),
  image: unsplashImageSchema.optional(),
})

export const spaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: colorSchema,
  createdAt: z.string(),
})

export const timerArraySchema = z.array(timerSchema)
export const spaceArraySchema = z.array(spaceSchema)

export const timersPayloadSchema = timerArraySchema.superRefine((timers, ctx) => {
  for (const timer of timers) {
    if (timer.label.length > 200) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.timerLabelTooLong", { label: `${timer.label.slice(0, 20)}...` }),
      })
    }

    // Any number of timers may be pinned, but an archived timer must not be.
    if (timer.pinned && timer.archivedAt) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.archivedPinned"),
      })
    }
  }
})

export const spacesPayloadSchema = spaceArraySchema.superRefine((spaces, ctx) => {
  for (const space of spaces) {
    if (space.name.length > 30) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.spaceNameTooLong", { name: `${space.name.slice(0, 15)}...` }),
      })
    }
  }
})

export const quickAddTimerFormSchema = z.object({
  label: z.string().trim().min(1).max(60),
  date: z.string().regex(dateInputPattern),
  time: z.string().regex(timeInputPattern),
  timezone: timezoneSchema,
})

export type QuickAddTimerFormValues = z.input<typeof quickAddTimerFormSchema>

export const timerFormSchema = z.object({
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200),
  url: z
    .string()
    .trim()
    .max(TIMER_URL_MAX_LENGTH)
    .refine((value) => value === "" || normalizeTimerUrl(value) !== null, {
      message: formatMessage("validation.timerUrlInvalid"),
    }),
  date: z.string().regex(dateInputPattern),
  time: z.string().regex(timeInputPattern),
  timezone: timezoneSchema,
  notify: z.boolean(),
  repeatEnabled: z.boolean(),
  repeatType: recurrenceTypeSchema,
  lastDay: z.boolean(),
  spaceId: z.string(),
  image: unsplashImageSchema.nullable(),
})

export const timerFormStepFields = {
  1: ["label", "description", "url", "spaceId"],
  2: ["date", "time", "timezone", "notify", "repeatEnabled", "repeatType", "lastDay"],
  3: ["image"],
} as const

export const timerFormStepSchemas = {
  1: timerFormSchema.pick({ label: true, description: true, url: true, spaceId: true }),
  2: timerFormSchema.pick({
    date: true,
    time: true,
    timezone: true,
    notify: true,
    repeatEnabled: true,
    repeatType: true,
    lastDay: true,
  }),
  3: timerFormSchema.pick({ image: true }),
} as const

export type TimerFormStep = keyof typeof timerFormStepSchemas
export type TimerFormValues = z.input<typeof timerFormSchema>
export type TimerFormParsedValues = z.output<typeof timerFormSchema>
export type TimerFormRecurrenceType = z.infer<typeof recurrenceTypeSchema>

export type TimerFormSubmitValue = {
  label: string
  targetDate: string
  timezone: string
  description?: string
  url?: string
  notify?: boolean
  recurrence?: { type: TimerFormRecurrenceType; enabled: boolean; lastDay?: boolean }
  spaceId?: string
  image?: UnsplashImage
}

export function isTimerFormStepValid(step: TimerFormStep, values: TimerFormValues) {
  return timerFormStepSchemas[step].safeParse(values).success
}
