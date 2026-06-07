import { createHash } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
}))

vi.mock("@/lib/rate-limit.server", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}))

describe("email OTP send rate limit", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset()
    mocks.enforceRateLimit.mockResolvedValue(null)
  })

  it("identifies Better Auth email OTP send requests", async () => {
    const { isEmailOtpSendRequest } = await import("./email-otp-rate-limit.server")

    expect(isEmailOtpSendRequest(new Request("https://tickward.test/api/auth/email-otp/send-verification-otp"))).toBe(
      true,
    )
    expect(isEmailOtpSendRequest(new Request("https://tickward.test/api/auth/get-session"))).toBe(false)
  })

  it("rate limits valid email payloads by normalized email hash", async () => {
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await expect(
      enforceEmailOtpSendRateLimit(
        new Request("https://tickward.test/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
          body: JSON.stringify({ email: " Ada@Example.com ", type: "sign-in" }),
        }),
      ),
    ).resolves.toBeNull()

    const expectedIpHash = createHash("sha256").update("203.0.113.10", "utf8").digest("hex")
    const expectedHash = createHash("sha256").update("ada@example.com", "utf8").digest("hex")
    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(1, "auth-otp-ip", `ip:${expectedIpHash}`)
    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(2, "auth-otp", `email:${expectedHash}`)
  })

  it("rate limits by IP before reading the email bucket", async () => {
    const limited = Response.json({ error: "limited" }, { status: 429 })
    mocks.enforceRateLimit.mockResolvedValueOnce(limited)
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await expect(
      enforceEmailOtpSendRateLimit(
        new Request("https://tickward.test/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: { "cf-connecting-ip": "203.0.113.20" },
          body: JSON.stringify({ email: "ada@example.com" }),
        }),
      ),
    ).resolves.toBe(limited)

    const expectedIpHash = createHash("sha256").update("203.0.113.20", "utf8").digest("hex")
    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("auth-otp-ip", `ip:${expectedIpHash}`)
  })

  it("lets Better Auth handle invalid email payloads after the IP limit passes", async () => {
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await expect(
      enforceEmailOtpSendRateLimit(
        new Request("https://tickward.test/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: { "x-real-ip": "203.0.113.30" },
          body: JSON.stringify({ email: "not-email" }),
        }),
      ),
    ).resolves.toBeNull()

    const expectedIpHash = createHash("sha256").update("203.0.113.30", "utf8").digest("hex")
    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("auth-otp-ip", `ip:${expectedIpHash}`)
  })
})
