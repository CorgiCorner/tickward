import { describe, expect, it } from "vitest"

import { createDemoProject, DEMO_PROJECT_ID, DEMO_RESTORE_KEY, DEMO_SHARE_ID } from "@/lib/demo-project"
import { validateSpacesPayload, validateTimersPayload } from "@/lib/validate"

describe("demo project", () => {
  it("builds a trustworthy screenshot seed project", () => {
    const demo = createDemoProject(new Date("2026-06-06T10:15:00.000Z"))

    expect(demo.project).toMatchObject({
      id: DEMO_PROJECT_ID,
      name: "My Watchlist & Subscriptions",
      restoreKey: DEMO_RESTORE_KEY,
      timerCount: 5,
      spaceCount: 2,
      hasUnsyncedChanges: false,
    })
    expect(demo.payload.sortMode).toBe("soonest")
    expect(demo.payload.spaces.map((space) => space.name)).toEqual(["Watchlist", "Subscriptions"])
    expect(demo.payload.timers.filter((timer) => timer.spaceId === "space_watchlist")).toHaveLength(3)
    expect(demo.payload.timers.filter((timer) => timer.spaceId === "space_subscriptions")).toHaveLength(2)
    expect(demo.payload.timers.filter((timer) => !timer.spaceId)).toHaveLength(0)
    expect(demo.payload.timers.map((timer) => timer.label)).toEqual([
      "Movie night with friends",
      "Season finale before spoilers",
      "Morning episode drop",
      "Streaming bill check",
      "Trial decision",
    ])
    expect(demo.payload.timers.filter((timer) => timer.pinned)).toHaveLength(1)
    expect(demo.payload.timers.filter((timer) => timer.sharedAt)).toHaveLength(1)
    expect(demo.payload.timers[0]?.sourceShareId).toBe(DEMO_SHARE_ID)
    expect(demo.payload.timers[0]?.notification).toEqual({ enabled: true })
    expect(validateSpacesPayload(demo.payload.spaces)).toBeNull()
    expect(validateTimersPayload(demo.payload.timers)).toBeNull()
  })
})
