import { describe, expect, it } from "vitest"

import {
  createDemoProject,
  DEMO_PROJECT_ID,
  DEMO_RESTORE_KEY,
  DEMO_SHARE_ID,
  DEMO_SHARED_TIMER_ID,
} from "@/lib/demo-project"
import { validateSpacesPayload, validateTimersPayload } from "@/lib/validate"

describe("demo project", () => {
  it("builds a trustworthy screenshot seed project", () => {
    const baseDate = new Date("2026-06-06T10:15:00.000Z")
    const demo = createDemoProject(baseDate)
    const spaceIds = new Set(demo.payload.spaces.map((space) => space.id))
    const sharedTimers = demo.payload.timers.filter((timer) => timer.sharedAt)

    expect(demo.project.id).toBe(DEMO_PROJECT_ID)
    expect(demo.project.restoreKey).toBe(DEMO_RESTORE_KEY)
    expect(demo.project.name.length).toBeGreaterThan(0)
    expect(demo.project.name.length).toBeLessThanOrEqual(40)
    expect(demo.project.timerCount).toBe(demo.payload.timers.length)
    expect(demo.project.spaceCount).toBe(demo.payload.spaces.length)
    expect(demo.project.hasUnsyncedChanges).toBe(false)
    expect(demo.payload.activeSpaceId).toBeNull()
    expect(demo.payload.sortMode).toBe("soonest")
    expect(demo.payload.updatedAt).toBe(demo.project.updatedAt)
    expect(demo.payload.spaces).toHaveLength(2)
    expect(demo.payload.spaces.map((space) => space.name)).toEqual(["Coming up", "Done"])
    for (const space of demo.payload.spaces) {
      expect(space.name.length).toBeGreaterThan(0)
      expect(space.name.length).toBeLessThanOrEqual(30)
    }
    expect(demo.payload.timers).toHaveLength(7)
    for (const timer of demo.payload.timers) {
      const description = timer.description ?? ""
      const targetDate = new Date(timer.targetDate)

      expect(timer.label.length).toBeGreaterThan(0)
      expect(description.length).toBeGreaterThan(0)
      expect(targetDate.toISOString()).toBe(timer.targetDate)
      expect(timer.spaceId ? spaceIds.has(timer.spaceId) : false).toBe(true)
      expect(timer.notification?.enabled).toBe(timer.notify ?? true)
    }
    expect(demo.payload.timers.filter((timer) => timer.pinned)).toHaveLength(1)
    expect(demo.payload.timers.filter((timer) => timer.recurrence?.enabled)).toHaveLength(2)
    expect(demo.payload.timers.some((timer) => new Date(timer.targetDate).getTime() < baseDate.getTime())).toBe(true)
    expect(sharedTimers).toHaveLength(1)
    expect(sharedTimers[0]?.id).toBe(DEMO_SHARED_TIMER_ID)
    expect(sharedTimers[0]?.sourceShareId).toBe(DEMO_SHARE_ID)
    expect(validateSpacesPayload(demo.payload.spaces)).toBeNull()
    expect(validateTimersPayload(demo.payload.timers)).toBeNull()
  })
})
