import { describe, expect, it } from "vitest"

import {
  countUpPolicyDurationMs,
  countUpPolicySchema,
  DEFAULT_COUNT_UP_POLICY,
  policyForTimer,
} from "@/lib/count-up-policy"

describe("count-up policies", () => {
  it("validates custom minutes without accepting minutes for fixed policies", () => {
    expect(countUpPolicySchema.safeParse({ mode: "custom", minutes: 45 }).success).toBe(true)
    expect(countUpPolicySchema.safeParse({ mode: "custom", minutes: null }).success).toBe(false)
    expect(countUpPolicySchema.safeParse({ mode: "after-seen-5m", minutes: 5 }).success).toBe(false)
  })

  it("maps fixed and custom policies to absolute durations", () => {
    expect(countUpPolicyDurationMs({ mode: "after-seen-5m", minutes: null })).toBe(300_000)
    expect(countUpPolicyDurationMs({ mode: "after-seen-1d", minutes: null })).toBe(86_400_000)
    expect(countUpPolicyDurationMs({ mode: "custom", minutes: 45 })).toBe(2_700_000)
    expect(countUpPolicyDurationMs(DEFAULT_COUNT_UP_POLICY)).toBeNull()
  })

  it("resolves per-timer overrides without changing the fallback", () => {
    const fallback = { mode: "after-seen-15m", minutes: null } as const
    expect(policyForTimer({ mode: "use-default" }, fallback)).toBe(fallback)
    expect(policyForTimer({ mode: "move-directly-to-past" }, fallback)).toEqual({
      mode: "move-directly-to-past",
      minutes: null,
    })
    expect(policyForTimer({ mode: "keep-visible", minutes: 90 }, fallback)).toEqual({
      mode: "custom",
      minutes: 90,
    })
    expect(policyForTimer({ mode: "until-reviewed" }, fallback)).toEqual({
      mode: "until-i-move-it",
      minutes: null,
    })
  })
})
