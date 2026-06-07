import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EmailOtpCommand, TimerFinishedEmailCommand } from "@/lib/mail-provider"
import { resendMailProvider } from "@/lib/adapters/resend-mail-provider.server"

const command: TimerFinishedEmailCommand = {
  to: "ada@example.com",
  timerId: "timer-a",
  label: "Deploy <script>",
  targetDate: "2026-06-05T21:37:00.000Z",
  timezone: "Europe/Warsaw",
}

const otpCommand: EmailOtpCommand = {
  to: "ada@example.com",
  otp: "123<456",
  type: "email-verification",
}

describe("resend mail provider", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM
    delete process.env.RESEND_REPLY_TO
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM
    delete process.env.RESEND_REPLY_TO
  })

  it("does nothing when Resend is not configured", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(resendMailProvider.id).toBe("resend")
    expect(resendMailProvider.isConfigured()).toBe(false)
    await resendMailProvider.sendTimerFinishedEmail(command)
    await resendMailProvider.sendEmailOtp(otpCommand)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends escaped timer email HTML through Resend", async () => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    process.env.RESEND_REPLY_TO = "contact@example.com"
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    expect(resendMailProvider.isConfigured()).toBe(true)
    await resendMailProvider.sendTimerFinishedEmail(command)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rk_test",
          "Content-Type": "application/json",
          "Idempotency-Key": "timer-email:timer-a:2026-06-05T21:37:00.000Z",
          "User-Agent": "tickward/1.0",
        }),
      }),
    )

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({
      from: "Tickward <noreply@example.com>",
      reply_to: "contact@example.com",
      to: ["ada@example.com"],
      subject: "Timer finished: Deploy <script>",
      html: "<p>Your timer <strong>Deploy &lt;script&gt;</strong> finished.</p><p>2026-06-05T21:37:00.000Z (Europe/Warsaw)</p>",
    })
  })

  it("throws when the configured Resend request fails", async () => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    process.env.RESEND_REPLY_TO = "contact@example.com"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })))

    await expect(resendMailProvider.sendTimerFinishedEmail(command)).rejects.toThrow("Resend email failed: 422")
  })

  it("sends escaped OTP email HTML through Resend", async () => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    process.env.RESEND_REPLY_TO = "contact@example.com"
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await resendMailProvider.sendEmailOtp(otpCommand)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rk_test",
          "Content-Type": "application/json",
          "User-Agent": "tickward/1.0",
        }),
      }),
    )

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({
      from: "Tickward <noreply@example.com>",
      reply_to: "contact@example.com",
      to: ["ada@example.com"],
      subject: "Verify your Tickward email",
      html: "<p>Your Tickward code is <strong>123&lt;456</strong>.</p><p>This code expires in 5 minutes.</p>",
    })
  })

  it("throws when the configured Resend OTP request fails", async () => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })))

    await expect(resendMailProvider.sendEmailOtp(otpCommand)).rejects.toThrow("Resend OTP email failed: 422")
  })
})
