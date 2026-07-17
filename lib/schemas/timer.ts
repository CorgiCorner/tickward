import { fromZonedTime } from "date-fns-tz"
import { z } from "zod"

import {
  COUNT_UP_POLICY_MAX_MINUTES,
  COUNT_UP_POLICY_MIN_MINUTES,
  timerAfterZeroSchema,
  type TimerAfterZero,
} from "@/lib/count-up-policy"
import { formatMessage } from "@/lib/i18n/messages"
import {
  duplicateMilestoneRuleIndexes,
  milestoneRuleSchema,
  timerMilestonesSchema,
  type MilestoneRule,
} from "@/lib/milestones"
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

export const SINCE_TIMER_RECIPE_IDS = ["anniversary", "monthiversary", "recovery-ladder", "streak"] as const
export type SinceTimerRecipeId = (typeof SINCE_TIMER_RECIPE_IDS)[number]
export type TimerCreationTemplateId = "blank" | "birthday" | "deadline" | SinceTimerRecipeId

type SinceTimerRecipePayload = {
  mode: "since"
  milestones: { rules: MilestoneRule[] }
  reminders: Array<{ offset_minutes: number }>
}

// Stable, API-facing recipe ids and payloads. UI labels are localized at the
// surface, while this registry remains the byte-for-byte product contract.
const SINCE_TIMER_RECIPES = {
  anniversary: {
    mode: "since",
    milestones: { rules: [{ unit: "years", every: 1 }] },
    reminders: [{ offset_minutes: 0 }, { offset_minutes: 1440 }],
  },
  monthiversary: {
    mode: "since",
    milestones: {
      rules: [
        { unit: "months", every: 1 },
        { unit: "years", every: 1 },
      ],
    },
    reminders: [{ offset_minutes: 0 }],
  },
  "recovery-ladder": {
    mode: "since",
    milestones: {
      rules: [
        { unit: "days", at: [1, 3] },
        { unit: "weeks", at: [1] },
        { unit: "months", at: [1, 3] },
        { unit: "years", at: [1] },
      ],
    },
    reminders: [{ offset_minutes: 0 }],
  },
  streak: {
    mode: "since",
    milestones: { rules: [{ unit: "weeks", every: 1 }] },
    reminders: [{ offset_minutes: 0 }],
  },
} as const satisfies Record<SinceTimerRecipeId, SinceTimerRecipePayload>

function cloneMilestoneRule(rule: MilestoneRule): MilestoneRule {
  return "every" in rule ? { ...rule } : { ...rule, at: [...rule.at] }
}

export function compileSinceTimerRecipe(id: SinceTimerRecipeId): SinceTimerRecipePayload {
  const recipe = SINCE_TIMER_RECIPES[id]
  return {
    mode: recipe.mode,
    milestones: { rules: recipe.milestones.rules.map((rule) => cloneMilestoneRule(rule)) },
    reminders: recipe.reminders.map((reminder) => ({ ...reminder })),
  }
}

export type TimerTemplateFormSeed = {
  timerMode: "until" | "since"
  milestoneRules: MilestoneRule[]
  reminders: Array<{ offsetMinutes: number }>
  repeatEnabled: boolean
  repeatType: "daily" | "weekly" | "monthly" | "yearly"
}

export function timerTemplateFormSeed(id: TimerCreationTemplateId): TimerTemplateFormSeed {
  if (id === "blank") {
    return { timerMode: "until", milestoneRules: [], reminders: [], repeatEnabled: false, repeatType: "yearly" }
  }
  if (id === "birthday") {
    return {
      timerMode: "until",
      milestoneRules: [],
      reminders: [{ offsetMinutes: 1440 }],
      repeatEnabled: true,
      repeatType: "yearly",
    }
  }
  if (id === "deadline") {
    return {
      timerMode: "until",
      milestoneRules: [],
      reminders: [{ offsetMinutes: 1440 }, { offsetMinutes: 0 }],
      repeatEnabled: false,
      repeatType: "yearly",
    }
  }

  const recipe = compileSinceTimerRecipe(id)
  return {
    timerMode: recipe.mode,
    milestoneRules: recipe.milestones.rules,
    reminders: recipe.reminders.map((reminder) => ({ offsetMinutes: reminder.offset_minutes })),
    repeatEnabled: false,
    repeatType: "yearly",
  }
}

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
    afterZero: timerAfterZeroSchema.optional(),
    mode: z.enum(["until", "since"]).optional(),
    milestones: timerMilestonesSchema.optional(),
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
    if (timer.mode === "since") {
      if (!timer.milestones) {
        ctx.addIssue({
          code: "custom",
          message: "Since timers need at least one milestone rule.",
          path: ["milestones"],
        })
      }
      if (timer.recurrence) {
        ctx.addIssue({
          code: "custom",
          message: "Since timers cannot recur.",
          path: ["recurrence"],
        })
      }
      if (timer.afterZero) {
        ctx.addIssue({
          code: "custom",
          message: "Since timers have no after-zero policy.",
          path: ["afterZero"],
        })
      }
    } else if (timer.milestones) {
      ctx.addIssue({
        code: "custom",
        message: "Only since timers can define milestones.",
        path: ["milestones"],
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
        message: formatMessage("validation.timerLabelTooLong", {
          label: `${timer.label.slice(0, 20)}...`,
        }),
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
        message: formatMessage("validation.spaceNameTooLong", {
          name: `${space.name.slice(0, 15)}...`,
        }),
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
  timerMode: z.enum(["until", "since"]),
  milestoneRules: z.array(milestoneRuleSchema).max(4),
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
  afterZeroMode: z.enum([
    "use-default",
    "move-directly-to-past",
    "keep-visible-5m",
    "keep-visible-15m",
    "keep-visible-1h",
    "keep-visible-1d",
    "keep-visible-custom",
    "until-reviewed",
  ]),
  afterZeroMinutes: z.string().regex(/^\d{1,6}$/, {
    message: formatMessage("validation.afterZeroMinutes"),
  }),
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

type SinceFormValues = Pick<
  z.infer<typeof timerFormBaseSchema>,
  "timerMode" | "milestoneRules" | "repeatEnabled" | "scheduleMode" | "date" | "time" | "timezone"
>

function addSinceFormIssues(form: SinceFormValues, ctx: z.RefinementCtx) {
  if (form.timerMode !== "since") {
    if (form.milestoneRules.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("timer.form.milestones.onlySince"),
        path: ["milestoneRules"],
      })
    }
    return
  }

  if (form.milestoneRules.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: formatMessage("timer.form.milestones.required"),
      path: ["milestoneRules"],
    })
  }
  for (const index of duplicateMilestoneRuleIndexes(form.milestoneRules)) {
    ctx.addIssue({
      code: "custom",
      message: formatMessage("timer.form.milestones.unique"),
      path: ["milestoneRules", index],
    })
  }
  if (form.repeatEnabled) {
    ctx.addIssue({
      code: "custom",
      message: formatMessage("timer.form.milestones.noRecurrence"),
      path: ["repeatEnabled"],
    })
  }
  if (form.scheduleMode !== "at") {
    ctx.addIssue({
      code: "custom",
      message: formatMessage("timer.form.milestones.anchorPast"),
      path: ["scheduleMode"],
    })
    return
  }
  if (dateInputPattern.test(form.date) && timeInputPattern.test(form.time)) {
    const anchorMs = fromZonedTime(`${form.date}T${form.time}:00`, form.timezone).getTime()
    if (Number.isFinite(anchorMs) && anchorMs > Date.now() + 60_000) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("timer.form.milestones.anchorPast"),
        path: ["date"],
      })
    }
  }
}

export const timerFormSchema = timerFormBaseSchema.superRefine((form, ctx) => {
  addScheduleModeIssues(form, ctx)
  addDuplicateReminderIssue(form.reminders, ctx)
  addSinceFormIssues(form, ctx)
  if (form.afterZeroMode === "keep-visible-custom") {
    const minutes = Number(form.afterZeroMinutes)
    if (
      !Number.isSafeInteger(minutes) ||
      minutes < COUNT_UP_POLICY_MIN_MINUTES ||
      minutes > COUNT_UP_POLICY_MAX_MINUTES
    ) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.afterZeroMinutes"),
        path: ["afterZeroMinutes"],
      })
    }
  }
})

export const timerFormStepFields = {
  1: ["label", "description", "url", "spaceId"],
  2: [
    "scheduleMode",
    "timerMode",
    "milestoneRules",
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
    "afterZeroMode",
    "afterZeroMinutes",
  ],
  3: ["image"],
} as const

export const timerFormStepSchemas = {
  1: timerFormBaseSchema.pick({
    label: true,
    description: true,
    url: true,
    spaceId: true,
  }),
  2: timerFormBaseSchema
    .pick({
      scheduleMode: true,
      timerMode: true,
      milestoneRules: true,
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
      afterZeroMode: true,
      afterZeroMinutes: true,
    })
    .superRefine((form, ctx) => {
      addScheduleModeIssues(form, ctx)
      addDuplicateReminderIssue(form.reminders, ctx)
      addSinceFormIssues(form, ctx)
      if (form.afterZeroMode === "keep-visible-custom") {
        const minutes = Number(form.afterZeroMinutes)
        if (
          !Number.isSafeInteger(minutes) ||
          minutes < COUNT_UP_POLICY_MIN_MINUTES ||
          minutes > COUNT_UP_POLICY_MAX_MINUTES
        ) {
          ctx.addIssue({
            code: "custom",
            message: formatMessage("validation.afterZeroMinutes"),
            path: ["afterZeroMinutes"],
          })
        }
      }
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
  recurrence?: {
    type: TimerFormRecurrenceType
    enabled: boolean
    lastDay?: boolean
  }
  spaceId?: string
  image?: UnsplashImage
  afterZero?: TimerAfterZero
  mode?: "until" | "since"
  milestones?: { rules: Array<z.infer<typeof milestoneRuleSchema>> }
}

export function timerAfterZeroFromForm(values: Pick<TimerFormValues, "afterZeroMode" | "afterZeroMinutes">) {
  if (values.afterZeroMode === "use-default") return { mode: "use-default" } satisfies TimerAfterZero
  if (values.afterZeroMode === "move-directly-to-past") {
    return { mode: "move-directly-to-past" } satisfies TimerAfterZero
  }
  if (values.afterZeroMode === "until-reviewed") return { mode: "until-reviewed" } satisfies TimerAfterZero
  const fixedMinutes =
    values.afterZeroMode === "keep-visible-5m"
      ? 5
      : values.afterZeroMode === "keep-visible-15m"
        ? 15
        : values.afterZeroMode === "keep-visible-1h"
          ? 60
          : values.afterZeroMode === "keep-visible-1d"
            ? 1_440
            : null
  return {
    mode: "keep-visible",
    minutes: fixedMinutes ?? Number(values.afterZeroMinutes),
  } satisfies TimerAfterZero
}

export function isTimerFormStepValid(step: TimerFormStep, values: TimerFormValues) {
  return timerFormStepSchemas[step].safeParse(values).success
}
