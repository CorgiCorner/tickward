import { z } from "zod"

import { formatMessage } from "@/lib/i18n/messages"

export const COUNT_UP_POLICY_MODES = [
  "move-directly-to-past",
  "until-i-move-it",
  "after-seen-5m",
  "after-seen-15m",
  "after-seen-1h",
  "after-seen-1d",
  "custom",
] as const

export const countUpPolicyModeSchema = z.enum(COUNT_UP_POLICY_MODES)

export const COUNT_UP_POLICY_MIN_MINUTES = 1
export const COUNT_UP_POLICY_MAX_MINUTES = 525_600

export const countUpPolicySchema = z
  .object({
    mode: countUpPolicyModeSchema,
    minutes: z.number().int().min(COUNT_UP_POLICY_MIN_MINUTES).max(COUNT_UP_POLICY_MAX_MINUTES).nullable(),
  })
  .superRefine((policy, ctx) => {
    if (policy.mode === "custom" && policy.minutes === null) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.countUpPolicyCustomMinutes"),
        path: ["minutes"],
      })
    }
    if (policy.mode !== "custom" && policy.minutes !== null) {
      ctx.addIssue({
        code: "custom",
        message: formatMessage("validation.countUpPolicyFixedMinutes"),
        path: ["minutes"],
      })
    }
  })

export type CountUpPolicyMode = z.infer<typeof countUpPolicyModeSchema>
export type CountUpPolicy = z.infer<typeof countUpPolicySchema>

export const timerAfterZeroSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("use-default") }).strict(),
  z.object({ mode: z.literal("move-directly-to-past") }).strict(),
  z
    .object({
      mode: z.literal("keep-visible"),
      minutes: z.number().int().min(COUNT_UP_POLICY_MIN_MINUTES).max(COUNT_UP_POLICY_MAX_MINUTES),
    })
    .strict(),
  z.object({ mode: z.literal("until-reviewed") }).strict(),
])

export type TimerAfterZero = z.infer<typeof timerAfterZeroSchema>

export const DEFAULT_COUNT_UP_POLICY: CountUpPolicy = { mode: "until-i-move-it", minutes: null }

export function normalizeCountUpPolicy(value: unknown): CountUpPolicy {
  const parsed = countUpPolicySchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_COUNT_UP_POLICY
}

export function countUpPolicyDurationMs(policy: CountUpPolicy): number | null {
  if (policy.mode === "after-seen-5m") return 5 * 60_000
  if (policy.mode === "after-seen-15m") return 15 * 60_000
  if (policy.mode === "after-seen-1h") return 60 * 60_000
  if (policy.mode === "after-seen-1d") return 24 * 60 * 60_000
  if (policy.mode === "custom" && policy.minutes !== null) return policy.minutes * 60_000
  return null
}

export function policyForTimer(afterZero: TimerAfterZero | undefined, fallback: CountUpPolicy): CountUpPolicy {
  if (!afterZero || afterZero.mode === "use-default") return fallback
  if (afterZero.mode === "move-directly-to-past") return { mode: "move-directly-to-past", minutes: null }
  if (afterZero.mode === "until-reviewed") return { mode: "until-i-move-it", minutes: null }
  return { mode: "custom", minutes: afterZero.minutes }
}
