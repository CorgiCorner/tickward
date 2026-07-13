import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ANONYMOUS_ENTITLEMENTS,
  canCreateTimer,
  canCreateTimerInSpace,
  defaultEntitlementsTable,
  getEntitlements,
  projectLimitMessage,
  setActiveClientPlan,
  setEntitlementsTable,
  spaceLimitMessage,
  timerLimitMessage,
  timerSpaceLimitMessage,
  type Entitlements,
} from "@/lib/entitlements"
import { getLimits } from "@/lib/limits"
import { timerLimitMessage as legacyTimerLimitMessage, timerWarnThreshold } from "@/lib/timer-limits"

describe("entitlements", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    setEntitlementsTable(defaultEntitlementsTable())
    setActiveClientPlan("anonymous")
  })

  it("builds anonymous and doubled free defaults while preserving the snapshot cap", () => {
    const table = defaultEntitlementsTable()
    expect(table.anonymous).toEqual(ANONYMOUS_ENTITLEMENTS)
    expect(table.free).toEqual({
      plan: "free",
      maxTimers: 40,
      maxTimersPerSpace: 40,
      maxProjects: 20,
      maxSpaces: 4,
      maxSnapshotTimers: 50,
    })
  })

  it("doubles anonymous environment overrides into the free plan", () => {
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS", "8")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE", "3")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_PROJECTS", "2")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_SPACES", "4")

    const table = defaultEntitlementsTable()
    expect(table.anonymous).toMatchObject({ maxTimers: 8, maxTimersPerSpace: 3, maxProjects: 2, maxSpaces: 4 })
    expect(table.free).toMatchObject({ maxTimers: 16, maxTimersPerSpace: 6, maxProjects: 4, maxSpaces: 8 })
    expect(table.free.maxSnapshotTimers).toBe(50)
  })

  it("ignores invalid public limit overrides", () => {
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS", "0")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE", "not-a-number")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_PROJECTS", "0")
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_SPACES", "1001")

    expect(defaultEntitlementsTable().anonymous).toEqual(ANONYMOUS_ENTITLEMENTS)
  })

  it("round-trips the active client table and plan", () => {
    const table = defaultEntitlementsTable()
    table.anonymous.maxProjects = 3
    table.free.maxProjects = 9
    setEntitlementsTable(table)

    setActiveClientPlan("anonymous")
    expect(getEntitlements().maxProjects).toBe(3)
    setActiveClientPlan("free")
    expect(getEntitlements().maxProjects).toBe(9)
    expect(getEntitlements({ kind: "user", user: { id: "user_1" } }).plan).toBe("free")
  })

  it("keeps client bridge setters as no-ops on the server", () => {
    const browserWindow = window
    vi.stubGlobal("window", undefined)
    const table = defaultEntitlementsTable()
    table.anonymous.maxProjects = 1
    setEntitlementsTable(table)
    setActiveClientPlan("free")

    expect(getEntitlements()).toEqual(defaultEntitlementsTable().anonymous)
    vi.stubGlobal("window", browserWindow)
  })

  it("allows creating timers below the total and per-space limits", () => {
    const entitlements = ANONYMOUS_ENTITLEMENTS
    expect(canCreateTimer(0, entitlements)).toBe(true)
    expect(canCreateTimer(entitlements.maxTimers, entitlements)).toBe(false)
    expect(canCreateTimerInSpace(1, entitlements.maxTimersPerSpace, entitlements)).toBe(false)
    expect(canCreateTimerInSpace(entitlements.maxTimers, 0, entitlements)).toBe(false)
  })

  it("adds the registration upsell only to anonymous limit messages", () => {
    const anonymous = defaultEntitlementsTable().anonymous
    const free = defaultEntitlementsTable().free
    const upsell = "Sign up free for higher limits."

    expect(timerLimitMessage(anonymous)).toContain(upsell)
    expect(timerSpaceLimitMessage(anonymous)).toContain(upsell)
    expect(spaceLimitMessage(anonymous)).toContain(upsell)
    expect(projectLimitMessage(anonymous)).toContain(upsell)
    expect(timerLimitMessage(free)).not.toContain(upsell)
    expect(timerSpaceLimitMessage(free)).not.toContain(upsell)
    expect(spaceLimitMessage(free)).not.toContain(upsell)
    expect(projectLimitMessage(free)).not.toContain(upsell)
  })

  it("keeps compatibility helpers dynamic", () => {
    const custom: Entitlements = { ...defaultEntitlementsTable().anonymous, maxTimers: 8 }
    const table = defaultEntitlementsTable()
    table.anonymous = custom
    setEntitlementsTable(table)

    expect(legacyTimerLimitMessage()).toBe(timerLimitMessage(custom))
    expect(timerWarnThreshold()).toBe(6)
    expect(getLimits()).toEqual({ projects: 10, spacesPerProject: 2, timersPerProject: 8 })
  })
})
