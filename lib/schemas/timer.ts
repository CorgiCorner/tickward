import { z } from "zod"

import { formatMessage } from "@/lib/i18n/messages"
import { NOTIFICATION_SOUNDS } from "@/lib/notification-preferences"

const isoDatePrefixPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const hexColorPattern = /^#[0-9a-fA-F]{6}$/
const safeIdPattern = /^[A-Za-z0-9_-]+$/
const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/
const timeInputPattern = /^([01]\d|2[0-3]):[0-5]\d$/
const twoDigitInputPattern = /^\d{1,2}$/

function isValidImageUrl(value: string) {
  return value.startsWith("https://images.unsplash.com/")
}

export const TIMER_URL_MAX_LENGTH = 2048
export const REMINDER_OFFSET_MAX_MINUTES = 40_320
export const MAX_TIMER_REMINDERS = 5

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

export const timerReminderSchema = z.object({
  offsetMinutes: z.number().int().min(0).max(REMINDER_OFFSET_MAX_MINUTES),
})

export function duplicateTimerReminderOffsetIndex(reminders: Array<{ offsetMinutes: number }> | undefined) {
  const seen = new Set<number>()
  for (const [index, reminder] of (reminders ?? []).entries()) {
    if (seen.has(reminder.offsetMinutes)) return index
    seen.add(reminder.offsetMinutes)
  }
  return null
}

export const unsplashImageSchema = z.object({
  unsplashId: z.string(),
  url: imageUrlSchema,
  thumbUrl: imageUrlSchema,
  authorName: z.string(),
  authorUrl: z.string(),
})

export type UnsplashImage = z.infer<typeof unsplashImageSchema>

export const timerSchema = z
  .object({
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
    reminders: z.array(timerReminderSchema).max(MAX_TIMER_REMINDERS).optional(),
    description: z.string().optional(),
    url: z.string().optional(),
    spaceId: z.string().optional(),
    image: unsplashImageSchema.optional(),
  })
  .superRefine((timer, ctx) => {
    const duplicateIndex = duplicateTimerReminderOffsetIndex(timer.reminders)
    if (duplicateIndex !== null) {
      ctx.addIssue({
        code: "custom",
        message: "Reminder offsets must be unique.",
        path: ["reminders", duplicateIndex, "offsetMinutes"],
      })
    }
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

const scheduleModeSchema = z.enum(["at", "in"])

function durationSegmentSchema(max: number) {
  return z
    .string()
    .regex(twoDigitInputPattern)
    .refine((value) => Number(value) >= 0 && Number(value) <= max)
}

const durationFieldsSchema = {
  durationDays: durationSegmentSchema(99),
  durationHours: durationSegmentSchema(99),
  durationMinutes: durationSegmentSchema(59),
  durationSeconds: durationSegmentSchema(59),
} as const

type ScheduleRefinementValues = {
  scheduleMode: "at" | "in"
  date: string
  time: string
  durationDays: string
  durationHours: string
  durationMinutes: string
  durationSeconds: string
}

function addScheduleModeIssues(form: ScheduleRefinementValues, ctx: z.RefinementCtx) {
  if (form.scheduleMode === "at") {
    if (!dateInputPattern.test(form.date)) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.dateInvalid"),
        path: ["date"],
      })
    }
    if (!timeInputPattern.test(form.time)) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.timeInvalid"),
        path: ["time"],
      })
    }
    return
  }

  if (durationTotalSeconds(form) < 1) {
    ctx.addIssue({
      code: "custom",
      message: formatMessage("validation.durationTooShort"),
      path: ["durationMinutes"],
    })
  }
}

export function durationTotalSeconds(values: {
  durationDays?: string
  durationHours?: string
  durationMinutes?: string
  durationSeconds?: string
}) {
  const days = Number.parseInt(values.durationDays ?? "0", 10)
  const hours = Number.parseInt(values.durationHours ?? "0", 10)
  const minutes = Number.parseInt(values.durationMinutes ?? "0", 10)
  const seconds = Number.parseInt(values.durationSeconds ?? "0", 10)
  return (
    (Number.isFinite(days) ? days : 0) * 86400 +
    (Number.isFinite(hours) ? hours : 0) * 3600 +
    (Number.isFinite(minutes) ? minutes : 0) * 60 +
    (Number.isFinite(seconds) ? seconds : 0)
  )
}

const quickAddTimerScheduleBaseSchema = z.object({
  scheduleMode: scheduleModeSchema,
  date: z.string(),
  time: z.string(),
  timezone: timezoneSchema,
  ...durationFieldsSchema,
})

export const quickAddTimerScheduleSchema = quickAddTimerScheduleBaseSchema.superRefine((form, ctx) => {
  addScheduleModeIssues(form, ctx)
})

export const quickAddTimerFormSchema = quickAddTimerScheduleBaseSchema
  .extend({
    label: z.string().trim().max(60),
  })
  .superRefine((form, ctx) => {
    addScheduleModeIssues(form, ctx)
  })

export type QuickAddTimerFormValues = z.input<typeof quickAddTimerFormSchema>

const timerFormBaseSchema = z.object({
  label: z.string().trim().max(60),
  description: z.string().trim().max(200),
  url: z
    .string()
    .trim()
    .max(TIMER_URL_MAX_LENGTH)
    .refine((value) => value === "" || normalizeTimerUrl(value) !== null, {
      message: formatMessage("validation.timerUrlInvalid"),
    }),
  scheduleMode: scheduleModeSchema,
  date: z.string(),
  time: z.string(),
  timezone: timezoneSchema,
  ...durationFieldsSchema,
  notify: z.boolean(),
  reminders: z.array(timerReminderSchema).max(MAX_TIMER_REMINDERS),
  repeatEnabled: z.boolean(),
  repeatType: recurrenceTypeSchema,
  lastDay: z.boolean(),
  spaceId: z.string(),
  image: unsplashImageSchema.nullable(),
})

function addDuplicateReminderIssue(reminders: Array<{ offsetMinutes: number }> | undefined, ctx: z.RefinementCtx) {
  const duplicateIndex = duplicateTimerReminderOffsetIndex(reminders)
  if (duplicateIndex === null) return
  ctx.addIssue({
    code: "custom",
    message: formatMessage("timer.form.reminders.duplicate"),
    path: ["reminders", duplicateIndex, "offsetMinutes"],
  })
}

export const timerFormSchema = timerFormBaseSchema.superRefine((form, ctx) => {
  addScheduleModeIssues(form, ctx)
  addDuplicateReminderIssue(form.reminders, ctx)
})

export const timerFormStepFields = {
  1: ["label", "description", "url", "spaceId"],
  2: [
    "scheduleMode",
    "date",
    "time",
    "timezone",
    "durationDays",
    "durationHours",
    "durationMinutes",
    "durationSeconds",
    "notify",
    "reminders",
    "repeatEnabled",
    "repeatType",
    "lastDay",
  ],
  3: ["image"],
} as const

export const timerFormStepSchemas = {
  1: timerFormBaseSchema.pick({ label: true, description: true, url: true, spaceId: true }),
  2: timerFormBaseSchema
    .pick({
      scheduleMode: true,
      date: true,
      time: true,
      timezone: true,
      durationDays: true,
      durationHours: true,
      durationMinutes: true,
      durationSeconds: true,
      notify: true,
      reminders: true,
      repeatEnabled: true,
      repeatType: true,
      lastDay: true,
    })
    .superRefine((form, ctx) => {
      addScheduleModeIssues(form, ctx)
      addDuplicateReminderIssue(form.reminders, ctx)
    }),
  3: timerFormBaseSchema.pick({ image: true }),
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
  reminders?: Array<{ offsetMinutes: number }>
  recurrence?: { type: TimerFormRecurrenceType; enabled: boolean; lastDay?: boolean }
  spaceId?: string
  image?: UnsplashImage
}

export function isTimerFormStepValid(step: TimerFormStep, values: TimerFormValues) {
  return timerFormStepSchemas[step].safeParse(values).success
}
