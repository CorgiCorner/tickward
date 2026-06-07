import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ANONYMOUS_ENTITLEMENTS,
  type Entitlements,
  canCreateTimer,
  canCreateTimerInSpace,
  getEntitlements,
  spaceLimitMessage,
  timerLimitMessage,
  timerSpaceLimitMessage,
} from "@/lib/entitlements"
import { MAX_TIMERS, timerLimitMessage as legacyTimerLimitMessage } from "@/lib/timer-limits"
import { MAX_SPACES } from "@/lib/types"

describe("entitlements", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("exposes the anonymous plan limits", () => {
    expect(ANONYMOUS_ENTITLEMENTS).toEqual({
      plan: "anonymous",
      maxTimers: 20,
      maxTimersPerSpace: 20,
      maxProjects: 12,
      maxSpaces: 2,
      maxSnapshotTimers: 50,
    })
  })

  it("returns the anonymous plan for any actor today", () => {
    expect(getEntitlements()).toEqual(ANONYMOUS_ENTITLEMENTS)
    expect(getEntitlements(null)).toEqual(ANONYMOUS_ENTITLEMENTS)
    expect(getEntitlements({ kind: "anonymous", restoreKey: "abc" })).toEqual(ANONYMOUS_ENTITLEMENTS)
  })

  it("allows creating timers below the limit and blocks at the limit", () => {
    const entitlements = ANONYMOUS_ENTITLEMENTS
    expect(canCreateTimer(0, entitlements)).toBe(true)
    expect(canCreateTimer(entitlements.maxTimers - 1, entitlements)).toBe(true)
    expect(canCreateTimer(entitlements.maxTimers, entitlements)).toBe(false)
    expect(canCreateTimer(entitlements.maxTimers + 1, entitlements)).toBe(false)
  })

  it("allows creating timers in a space below both limits", () => {
    const entitlements = ANONYMOUS_ENTITLEMENTS
    expect(canCreateTimerInSpace(0, 0, entitlements)).toBe(true)
    expect(canCreateTimerInSpace(1, entitlements.maxTimersPerSpace, entitlements)).toBe(false)
    expect(canCreateTimerInSpace(entitlements.maxTimers, 0, entitlements)).toBe(false)
  })

  it("produces the same limit message as the legacy helper", () => {
    expect(timerLimitMessage(ANONYMOUS_ENTITLEMENTS)).toBe(
      "You have reached the 20 timer limit. Delete a timer to add another.",
    )
    expect(timerLimitMessage(ANONYMOUS_ENTITLEMENTS)).toBe(legacyTimerLimitMessage())
    expect(timerLimitMessage(ANONYMOUS_ENTITLEMENTS)).toBe(legacyTimerLimitMessage(MAX_TIMERS))
  })

  it("reflects custom limits in the message", () => {
    const custom: Entitlements = { ...ANONYMOUS_ENTITLEMENTS, maxTimers: 7 }
    expect(timerLimitMessage(custom)).toBe("You have reached the 7 timer limit. Delete a timer to add another.")
    expect(timerLimitMessage(custom)).toBe(legacyTimerLimitMessage(7))
  })

  it("reflects custom space limits in messages", () => {
    const custom: Entitlements = { ...ANONYMOUS_ENTITLEMENTS, maxSpaces: 3, maxTimersPerSpace: 4 }
    expect(timerSpaceLimitMessage(custom)).toBe(
      "This space already has 4 active timers. Archive one to add another here.",
    )
    expect(spaceLimitMessage(custom)).toBe("You have reached the 3 space limit.")
  })

  it("reads safe public limit overrides from env", () => {
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS", "8")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE", "3")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_SPACES", "4")

    expect(getEntitlements()).toEqual({
      ...ANONYMOUS_ENTITLEMENTS,
      maxTimers: 8,
      maxTimersPerSpace: 3,
      maxSpaces: 4,
    })
  })

  it("ignores invalid public limit overrides", () => {
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS", "0")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE", "not-a-number")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_SPACES", "1001")

    expect(getEntitlements()).toEqual(ANONYMOUS_ENTITLEMENTS)
  })

  it("keeps MAX_TIMERS in sync with the anonymous plan", () => {
    expect(MAX_TIMERS).toBe(ANONYMOUS_ENTITLEMENTS.maxTimers)
  })

  it("keeps MAX_SPACES in sync with the anonymous plan", () => {
    expect(ANONYMOUS_ENTITLEMENTS.maxSpaces).toBe(MAX_SPACES)
  })
})
