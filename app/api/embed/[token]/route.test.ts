import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  resolveTimerShare: vi.fn(),
}))

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock("@/lib/share-service.server", () => ({
  resolveTimerShare: mocks.resolveTimerShare,
}))

const nowIso = "2026-06-11T12:00:00.000Z"
const routableToken = "timer_embedToken1234567890"
const nonRoutableToken = "badprefix_embedToken1234"

const resolvedShare = {
  resolvedFrom: "live" as const,
  timer: {
    label: "Product launch",
    targetDate: "2026-06-23T18:00:00.000Z",
    timezone: "Europe/Warsaw",
  },
}

function request(token: string) {
  return new Request(`https://tickward.test/api/embed/${token}`)
}

function context(token: string) {
  return { params: Promise.resolve({ token }) }
}

function expectEmbedHeaders(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*")
  expect(res.headers.get("cache-control")).toBe("public, max-age=60, stale-while-revalidate=300")
}

describe("GET /api/embed/[token]", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(nowIso))
    mocks.checkRateLimit.mockReset()
    mocks.resolveTimerShare.mockReset()
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} })
    mocks.resolveTimerShare.mockResolvedValue(resolvedShare)
  })

  it("returns 200 unavailable for a non-routable token without hitting services", async () => {
    const { GET } = await import("./route")

    const res = await GET(request(nonRoutableToken), context(nonRoutableToken))

    expect(res.status).toBe(200)
    expectEmbedHeaders(res)
    await expect(res.json()).resolves.toEqual({ state: "unavailable", now: nowIso })
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
    expect(mocks.resolveTimerShare).not.toHaveBeenCalled()
  })

  it("returns the counting state with the timer payload for a future target", async () => {
    const { GET } = await import("./route")

    const res = await GET(request(routableToken), context(routableToken))

    expect(res.status).toBe(200)
    expectEmbedHeaders(res)
    const body = await res.json()
    expect(body).toEqual({
      state: "counting",
      now: nowIso,
      timer: {
        label: "Product launch",
        targetDate: "2026-06-23T18:00:00.000Z",
        timezone: "Europe/Warsaw",
      },
    })
    expect(body.timer).not.toHaveProperty("color")
    expect(body.timer).not.toHaveProperty("description")
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("embed-state", `unknown:${routableToken}`)
    expect(mocks.resolveTimerShare).toHaveBeenCalledWith(routableToken)
  })

  it("returns the since state and optional fields for a past target", async () => {
    const { GET } = await import("./route")
    mocks.resolveTimerShare.mockResolvedValue({
      resolvedFrom: "live" as const,
      timer: {
        ...resolvedShare.timer,
        targetDate: "2026-05-20T09:30:00.000Z",
        color: "#e85d2a",
        description: "Countdown to the big day",
        refreshOnFinish: true,
      },
    })

    const res = await GET(request(routableToken), context(routableToken))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      state: "since",
      now: nowIso,
      timer: {
        label: "Product launch",
        targetDate: "2026-05-20T09:30:00.000Z",
        timezone: "Europe/Warsaw",
        color: "#e85d2a",
        description: "Countdown to the big day",
      },
    })
    expect(body.timer).not.toHaveProperty("refreshOnFinish")
  })

  it("returns 200 unavailable when the token does not resolve", async () => {
    const { GET } = await import("./route")
    mocks.resolveTimerShare.mockResolvedValue(null)

    const res = await GET(request(routableToken), context(routableToken))

    expect(res.status).toBe(200)
    expectEmbedHeaders(res)
    await expect(res.json()).resolves.toEqual({ state: "unavailable", now: nowIso })
  })

  it("returns 200 unavailable with retry headers when rate limited", async () => {
    const { GET } = await import("./route")
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, headers: { "retry-after": "60" } })

    const res = await GET(request(routableToken), context(routableToken))

    expect(res.status).toBe(200)
    expect(res.headers.get("retry-after")).toBe("60")
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    await expect(res.json()).resolves.toEqual({ state: "unavailable", now: nowIso })
    expect(mocks.resolveTimerShare).not.toHaveBeenCalled()
  })

  it("fails open when the rate limiter is unreachable", async () => {
    const { GET } = await import("./route")
    mocks.checkRateLimit.mockRejectedValue(new Error("limiter backend unreachable"))

    const res = await GET(request(routableToken), context(routableToken))

    expect(res.status).toBe(200)
    expectEmbedHeaders(res)
    await expect(res.json()).resolves.toMatchObject({ state: "counting" })
    expect(mocks.resolveTimerShare).toHaveBeenCalledWith(routableToken)
  })
})
