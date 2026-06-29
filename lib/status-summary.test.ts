import { afterEach, describe, expect, it, vi } from "vitest"

import { getServiceStatusLevel, statusDotClass } from "@/lib/status-summary"

function mockHeartbeat(heartbeatList: Record<string, Array<{ status?: number }>>) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ heartbeatList }) }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getServiceStatusLevel", () => {
  it("is operational when every monitor's latest beat is up", async () => {
    mockHeartbeat({ "1": [{ status: 1 }], "2": [{ status: 1 }] })
    expect(await getServiceStatusLevel()).toBe("operational")
  })

  it("is down when any monitor's latest beat is down", async () => {
    mockHeartbeat({ "1": [{ status: 1 }], "2": [{ status: 1 }, { status: 0 }] })
    expect(await getServiceStatusLevel()).toBe("down")
  })

  it("is degraded when a monitor is pending or in maintenance", async () => {
    mockHeartbeat({ "1": [{ status: 1 }], "2": [{ status: 2 }] })
    expect(await getServiceStatusLevel()).toBe("degraded")
  })

  it("is unknown when there are no beats", async () => {
    mockHeartbeat({})
    expect(await getServiceStatusLevel()).toBe("unknown")
  })

  it("is unknown when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await getServiceStatusLevel()).toBe("unknown")
  })
})

describe("statusDotClass", () => {
  it("maps each level to a colour, with a neutral fallback for unknown", () => {
    expect(statusDotClass("operational")).toContain("emerald")
    expect(statusDotClass("degraded")).toContain("amber")
    expect(statusDotClass("down")).toContain("red")
    expect(statusDotClass("unknown")).toContain("muted-foreground")
  })
})
