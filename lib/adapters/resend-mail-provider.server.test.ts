import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EmailOtpCommand, TimerFinishedEmailCommand, TimerReminderEmailCommand } from "@/lib/mail-provider"
import { formatEmailDate, resendMailProvider } from "@/lib/adapters/resend-mail-provider.server"

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

const reminderCommand: TimerReminderEmailCommand = {
  ...command,
  offsetMinutes: 10,
  occurrenceAt: "2026-06-05T21:37:00.000Z",
  transactionId: "timer-reminder:timer-a:10m:2026-06-05T21:37:00.000Z",
  mode: "until",
}

describe("formatEmailDate", () => {
  it("formats the instant in the timer's own zone", () => {
    expect(formatEmailDate("2026-11-09T09:00:00.000Z", "Europe/Warsaw")).toBe("Monday, 9 November 2026 at 10:00")
  })

  it("falls back to UTC for an unknown zone and keeps unparseable input", () => {
    expect(formatEmailDate("2026-11-09T09:00:00.000Z", "Mars/Olympus")).toBe("Monday, 9 November 2026 at 09:00")
    expect(formatEmailDate("soon", "Europe/Warsaw")).toBe("soon")
  })
})

describe("resend mail provider", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM
    delete process.env.RESEND_REPLY_TO
    delete process.env.SITE_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM
    delete process.env.RESEND_REPLY_TO
    delete process.env.SITE_URL
  })

  it("does nothing when Resend is not configured", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(resendMailProvider.id).toBe("resend")
    expect(resendMailProvider.isConfigured()).toBe(false)
    await resendMailProvider.sendTimerFinishedEmail(command)
    await resendMailProvider.sendTimerReminderEmail(reminderCommand)
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
    expect(body).toEqual(
      expect.objectContaining({
        from: "Tickward <noreply@example.com>",
        reply_to: "contact@example.com",
        to: ["ada@example.com"],
        subject: "Timer finished: Deploy <script>",
      }),
    )
    expect(body.html).toContain('Your timer <strong style="color:#18181b;">Deploy &lt;script&gt;</strong> finished.')
    expect(body.html).toContain("Friday, 5 June 2026 at 23:37 (Warsaw time)")
    expect(body.html).not.toContain("2026-06-05T21:37:00.000Z")
    expect(body.html).not.toContain("<script>")
  })

  it("throws when the configured Resend request fails", async () => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    process.env.RESEND_REPLY_TO = "contact@example.com"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })))

    await expect(resendMailProvider.sendTimerFinishedEmail(command)).rejects.toThrow("Resend email failed: 422")
  })

  it("sends reminder email HTML with the outbox transaction idempotency key", async () => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    process.env.RESEND_REPLY_TO = "contact@example.com"
    process.env.SITE_URL = "https://example.test"
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await resendMailProvider.sendTimerReminderEmail(reminderCommand)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rk_test",
          "Content-Type": "application/json",
          "Idempotency-Key": reminderCommand.transactionId,
          "User-Agent": "tickward/1.0",
        }),
      }),
    )

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toEqual(
      expect.objectContaining({
        from: "Tickward <noreply@example.com>",
        reply_to: "contact@example.com",
        to: ["ada@example.com"],
        subject: "Reminder: Deploy <script>",
      }),
    )
    expect(body.html).toContain(
      '<strong style="color:#18181b;">Deploy &lt;script&gt;</strong> is due on Friday, 5 June 2026 at 23:37 (Warsaw time). You asked to be reminded 10 minutes before.',
    )
    expect(body.html).toContain('<img src="https://example.test/icon-192.png"')
    expect(body.html).toContain('href="https://example.test/en/settings#alerts"')
    expect(body.html).toContain(">Manage reminder emails</a>")
    expect(body.html).not.toContain("2026-06-05T21:37:00.000Z")
  })

  it.each([
    [0, "1000 days since Deploy <script>", "It's been 1000 days since <strong>Deploy &lt;script&gt;</strong>."],
    [
      1_440,
      "1000 days since Deploy <script> coming up",
      "Your 1000 days milestone since <strong>Deploy &lt;script&gt;</strong> is coming up.",
    ],
  ])("renders milestone email copy for offset %i", async (offsetMinutes, subject, milestoneBody) => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    process.env.SITE_URL = "https://example.test"
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await resendMailProvider.sendTimerReminderEmail({
      ...reminderCommand,
      mode: "since",
      milestone: { unit: "days", count: 1000 },
      offsetMinutes,
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.subject).toBe(subject)
    expect(body.html).toContain(milestoneBody.replaceAll("<strong>", '<strong style="color:#18181b;">'))
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
    expect(body).toEqual(
      expect.objectContaining({
        from: "Tickward <noreply@example.com>",
        reply_to: "contact@example.com",
        to: ["ada@example.com"],
        subject: "Verify your Tickward email",
      }),
    )
    expect(body.html).toContain('Your Tickward code is <strong style="color:#18181b;">123&lt;456</strong>.')
    expect(body.html).toContain("This code expires in 10 minutes.")
    expect(body.html).not.toContain("123<456")
  })

  it("throws when the configured Resend OTP request fails", async () => {
    process.env.RESEND_API_KEY = "rk_test"
    process.env.RESEND_FROM = "Tickward <noreply@example.com>"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })))

    await expect(resendMailProvider.sendEmailOtp(otpCommand)).rejects.toThrow("Resend OTP email failed: 422")
  })
})
