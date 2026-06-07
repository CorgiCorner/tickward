import { beforeEach, describe, expect, it, vi } from "vitest"

import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  enforceEmailOtpSendRateLimit: vi.fn(),
  getTickwardAuth: vi.fn(),
  isEmailOtpSendRequest: vi.fn(),
  postHandler: vi.fn(),
  toNextJsHandler: vi.fn(),
}))

vi.mock("@/lib/auth/auth.server", () => ({
  getTickwardAuth: mocks.getTickwardAuth,
}))

vi.mock("@/lib/auth/email-otp-rate-limit.server", () => ({
  enforceEmailOtpSendRateLimit: mocks.enforceEmailOtpSendRateLimit,
  isEmailOtpSendRequest: mocks.isEmailOtpSendRequest,
}))

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: mocks.toNextJsHandler,
}))

describe("/api/auth/[...all]", () => {
  beforeEach(() => {
    mocks.enforceEmailOtpSendRateLimit.mockReset()
    mocks.enforceEmailOtpSendRateLimit.mockResolvedValue(null)
    mocks.getTickwardAuth.mockReset()
    mocks.getTickwardAuth.mockReturnValue(null)
    mocks.isEmailOtpSendRequest.mockReset()
    mocks.isEmailOtpSendRequest.mockReturnValue(false)
    mocks.postHandler.mockReset()
    mocks.postHandler.mockResolvedValue(Response.json({ ok: true }))
    mocks.toNextJsHandler.mockReset()
    mocks.toNextJsHandler.mockReturnValue({ POST: mocks.postHandler })
  })

  it("returns an empty session read until Better Auth is configured", async () => {
    const { GET } = await import("./route")

    const res = await GET(new Request("https://tickward.test/api/auth/get-session"))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toBeNull()
  })

  it("returns 501 for auth actions until Better Auth is configured", async () => {
    const { POST } = await import("./route")

    const res = await POST(new Request("https://tickward.test/api/auth/email-otp/send-verification-otp"))

    expect(res.status).toBe(501)
    await expectPublicError(res, PUBLIC_ERROR_CODES.authNotConfigured, "errors.authNotConfigured")
  })

  it("does not leak partial auth configuration errors through session reads", async () => {
    const { GET, POST } = await import("./route")
    mocks.getTickwardAuth.mockImplementation(() => {
      throw new Error("BETTER_AUTH_SECRET is partially configured")
    })

    const session = await GET(new Request("https://tickward.test/api/auth/get-session"))
    expect(session.status).toBe(200)
    await expect(session.json()).resolves.toBeNull()

    const action = await POST(new Request("https://tickward.test/api/auth/email-otp/send-verification-otp"))
    expect(action.status).toBe(501)
    await expectPublicError(action, PUBLIC_ERROR_CODES.authNotConfigured, "errors.authNotConfigured")
  })

  it("rate limits OTP send requests before delegating to Better Auth", async () => {
    const { POST } = await import("./route")
    const limited = Response.json({ error: "limited" }, { status: 429 })
    mocks.getTickwardAuth.mockReturnValue({ auth: true })
    mocks.isEmailOtpSendRequest.mockReturnValue(true)
    mocks.enforceEmailOtpSendRateLimit.mockResolvedValue(limited)

    const res = await POST(new Request("https://tickward.test/api/auth/email-otp/send-verification-otp"))

    expect(res).toBe(limited)
    expect(mocks.postHandler).not.toHaveBeenCalled()
  })

  it("delegates OTP send requests when the Redis rate limit allows them", async () => {
    const { POST } = await import("./route")
    mocks.getTickwardAuth.mockReturnValue({ auth: true })
    mocks.isEmailOtpSendRequest.mockReturnValue(true)

    const res = await POST(new Request("https://tickward.test/api/auth/email-otp/send-verification-otp"))

    expect(res.status).toBe(200)
    expect(mocks.enforceEmailOtpSendRateLimit).toHaveBeenCalled()
    expect(mocks.postHandler).toHaveBeenCalled()
  })
})
