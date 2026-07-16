import { beforeEach, describe, expect, it, vi } from "vitest"

import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import { expectPublicError } from "@/test/public-error-assertions"

const mocks = vi.hoisted(() => ({
  enforceEmailOtpSendRateLimit: vi.fn(),
  getTickwardAuth: vi.fn(),
  isEmailOtpSendRequest: vi.fn(),
  postHandler: vi.fn(),
  recordAuditEvent: vi.fn(),
  trackEmailOtpDelivery: vi.fn(),
  toNextJsHandler: vi.fn(),
}))

vi.mock("@/lib/audit-log.server", () => ({
  auditRequestContext: (input: Request | Headers) => {
    const headers = input instanceof Request ? input.headers : input
    return {
      ip: headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? null,
      userAgent: headers.get("user-agent")?.trim() ?? null,
    }
  },
  recordAuditEvent: mocks.recordAuditEvent,
}))

vi.mock("@/lib/auth/auth.server", () => ({
  getTickwardAuth: mocks.getTickwardAuth,
}))

vi.mock("@/lib/auth/email-otp-rate-limit.server", () => ({
  enforceEmailOtpSendRateLimit: mocks.enforceEmailOtpSendRateLimit,
  isEmailOtpSendRequest: mocks.isEmailOtpSendRequest,
}))

vi.mock("@/lib/auth/email-otp-delivery-context.server", () => ({
  trackEmailOtpDelivery: mocks.trackEmailOtpDelivery,
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
    mocks.recordAuditEvent.mockReset()
    mocks.trackEmailOtpDelivery.mockReset()
    mocks.trackEmailOtpDelivery.mockImplementation(async (task: () => Promise<Response>) => ({
      deliveryFailed: false,
      value: await task(),
    }))
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

  it("returns a generic error when OTP email delivery fails", async () => {
    const { POST } = await import("./route")
    mocks.getTickwardAuth.mockReturnValue({ auth: true })
    mocks.isEmailOtpSendRequest.mockReturnValue(true)
    mocks.postHandler.mockResolvedValue(Response.json({ success: true }))
    mocks.trackEmailOtpDelivery.mockImplementation(async (task: () => Promise<Response>) => ({
      deliveryFailed: true,
      value: await task(),
    }))

    const res = await POST(new Request("https://tickward.test/api/auth/email-otp/send-verification-otp"))

    expect(res.status).toBe(502)
    const responseText = await res.clone().text()
    await expectPublicError(res, PUBLIC_ERROR_CODES.authEmailDeliveryFailed, "auth.error.generic")
    expect(responseText).not.toContain("private detail")
  })

  it("audits failed OTP verification without logging the OTP code", async () => {
    const { POST } = await import("./route")
    mocks.getTickwardAuth.mockReturnValue({ auth: true })
    mocks.postHandler.mockResolvedValue(Response.json({ error: "invalid" }, { status: 401 }))

    const res = await POST(
      new Request("https://tickward.test/api/auth/sign-in/email-otp", {
        body: JSON.stringify({ email: "ada@example.com", otp: "123456" }),
        headers: {
          "content-type": "application/json",
          "user-agent": "Test Browser",
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
        method: "POST",
      }),
    )

    expect(res.status).toBe(401)
    await vi.waitFor(() => {
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
        action: "auth.otp.failed",
        actorEmail: "ada@example.com",
        ip: "203.0.113.10",
        metadata: { path: "/sign-in/email-otp", type: "sign-in" },
        targetType: "auth_otp",
        userAgent: "Test Browser",
      })
    })
    expect(JSON.stringify(mocks.recordAuditEvent.mock.calls[0]?.[0])).not.toContain("123456")
  })

  it("audits successful admin ban operations by target user", async () => {
    const { POST } = await import("./route")
    mocks.getTickwardAuth.mockReturnValue({ auth: true })

    const res = await POST(
      new Request("https://tickward.test/api/auth/admin/ban-user", {
        body: JSON.stringify({ banExpiresIn: 3600, banReason: "policy", userId: "user_456" }),
        headers: {
          "content-type": "application/json",
          "user-agent": "Test Browser",
          "x-forwarded-for": "203.0.113.10",
        },
        method: "POST",
      }),
    )

    expect(res.status).toBe(200)
    await vi.waitFor(() => {
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
        action: "admin.user.banned",
        actorEmail: null,
        actorId: null,
        ip: "203.0.113.10",
        metadata: { ban_expires_in_seconds: 3600, has_reason: true },
        targetId: "user_456",
        targetType: "user",
        userAgent: "Test Browser",
      })
    })
  })
})
