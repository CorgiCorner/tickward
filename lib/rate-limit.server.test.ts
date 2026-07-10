import { beforeEach, describe, expect, it, vi } from "vitest"

import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  getRedis: vi.fn(),
  limit: vi.fn(),
  slidingWindow: vi.fn((limit: number, window: string) => ({ limit, window })),
}))

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class RatelimitMock {
    static slidingWindow = mocks.slidingWindow

    constructor(config: unknown) {
      mocks.constructor(config)
    }

    limit(identifier: string) {
      return mocks.limit(identifier)
    }
  },
}))

vi.mock("@/lib/redis", () => ({
  getRedis: mocks.getRedis,
}))

describe("rate limit enforcement", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useRealTimers()
    mocks.constructor.mockReset()
    mocks.getRedis.mockReset()
    mocks.getRedis.mockReturnValue({ redis: true })
    mocks.limit.mockReset()
    mocks.slidingWindow.mockClear()
  })

  it("allows requests that are within the bucket limit", async () => {
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    const { enforceRateLimit } = await import("./rate-limit.server")

    await expect(enforceRateLimit("write", "restoreKey_123")).resolves.toBeNull()
    expect(mocks.slidingWindow).toHaveBeenCalledWith(30, "60 s")
    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        redis: { redis: true },
        prefix: "tickward:ratelimit:write",
        ephemeralCache: false,
      }),
    )
    expect(mocks.limit).toHaveBeenCalledWith("restoreKey_123")
  })

  it("returns 429 responses with retry and rate-limit headers", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"))
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 12_500,
      pending: Promise.resolve(),
    })

    const { enforceRateLimit } = await import("./rate-limit.server")

    const res = await enforceRateLimit("share-create", "restoreKey_123")

    expect(res?.status).toBe(429)
    expect(res?.headers.get("Retry-After")).toBe("13")
    expect(res?.headers.get("X-RateLimit-Limit")).toBe("10")
    expect(res?.headers.get("X-RateLimit-Remaining")).toBe("0")
    expect(res?.headers.get("X-RateLimit-Reset")).toBe(String(Date.now() + 12_500))
    if (!res) throw new Error("expected rate limit response")
    await expectPublicError(res, PUBLIC_ERROR_CODES.rateLimited, "errors.rateLimited")
  })

  it("fails closed when Redis rate limiting is unavailable", async () => {
    mocks.limit.mockRejectedValue(new Error("redis unavailable"))

    const { enforceRateLimit } = await import("./rate-limit.server")

    const res = await enforceRateLimit("clear", "restoreKey_123")

    expect(res?.status).toBe(503)
    if (!res) throw new Error("expected rate limit response")
    await expectPublicError(res, PUBLIC_ERROR_CODES.rateLimitUnavailable, "errors.rateLimitUnavailable")
  })

  it("configures a one-per-minute OTP send bucket", async () => {
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 1,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    const { enforceRateLimit } = await import("./rate-limit.server")

    await expect(enforceRateLimit("auth-otp", "email:hash")).resolves.toBeNull()
    expect(mocks.slidingWindow).toHaveBeenCalledWith(1, "60 s")
    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "tickward:ratelimit:auth-otp",
      }),
    )
  })

  it("configures a three-per-minute OTP send bucket per IP", async () => {
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    const { enforceRateLimit } = await import("./rate-limit.server")

    await expect(enforceRateLimit("auth-otp-ip", "ip:hash")).resolves.toBeNull()
    expect(mocks.slidingWindow).toHaveBeenCalledWith(3, "60 s")
    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "tickward:ratelimit:auth-otp-ip",
      }),
    )
  })

  it("configures a two-per-minute account export bucket", async () => {
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 2,
      remaining: 1,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    const { enforceRateLimit } = await import("./rate-limit.server")

    await expect(enforceRateLimit("account-export", "user:user_123")).resolves.toBeNull()
    expect(mocks.slidingWindow).toHaveBeenCalledWith(2, "60 s")
    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "tickward:ratelimit:account-export",
      }),
    )
  })
})
