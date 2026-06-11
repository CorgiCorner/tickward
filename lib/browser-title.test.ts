import { describe, expect, it } from "vitest"

import { browserTitle } from "@/lib/browser-title"
import { makeTimer } from "@/test/factories"

describe("browserTitle", () => {
  it("shows the nearest active timer countdown", () => {
    expect(
      browserTitle({
        projectName: "Launches",
        timers: [
          makeTimer({ id: "later", label: "Later", targetDate: "2026-06-05T10:00:00.000Z" }),
          makeTimer({ id: "soon", label: "Deploy", targetDate: "2026-06-05T08:05:12.000Z" }),
        ],
        nowMs: Date.parse("2026-06-05T08:00:00.000Z"),
      }),
    ).toBe("5m 12s - Deploy | tickward")
  })

  it("shows the nearest active timer label during the alternate title phase", () => {
    expect(
      browserTitle({
        projectName: "Launches",
        timers: [
          makeTimer({ id: "later", label: "Later", targetDate: "2026-06-05T10:00:00.000Z" }),
          makeTimer({ id: "soon", label: "Deploy", targetDate: "2026-06-05T08:05:12.000Z" }),
        ],
        nowMs: Date.parse("2026-06-05T08:00:03.000Z"),
      }),
    ).toBe("Deploy | tickward")
  })

  it("falls back to the project title without future timers", () => {
    expect(
      browserTitle({
        projectName: "Launches",
        timers: [makeTimer({ targetDate: "2026-06-05T07:00:00.000Z" })],
        nowMs: Date.parse("2026-06-05T08:00:01.000Z"),
      }),
    ).toBe("Launches | tickward")
  })
})
