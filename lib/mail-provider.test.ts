import { describe, expect, it } from "vitest"

import {
  getMailProvider,
  nullMailProvider,
  type EmailOtpCommand,
  type TimerFinishedEmailCommand,
  type TimerReminderEmailCommand,
} from "./mail-provider"

describe("mail provider", () => {
  it("null provider sends without throwing and resolves void", async () => {
    const command: TimerFinishedEmailCommand = {
      to: "user@example.com",
      timerId: "timer_123",
      label: "Launch",
      targetDate: "2026-05-25T12:00:00.000Z",
      timezone: "Europe/Warsaw",
    }

    expect(nullMailProvider.id).toBe("none")
    expect(nullMailProvider.isConfigured()).toBe(false)
    await expect(nullMailProvider.sendTimerFinishedEmail(command)).resolves.toBeUndefined()
  })

  it("null provider accepts OTP email commands", async () => {
    const command: EmailOtpCommand = {
      to: "user@example.com",
      otp: "123456",
      type: "sign-in",
    }

    await expect(nullMailProvider.sendEmailOtp(command)).resolves.toBeUndefined()
  })

  it("null provider accepts timer reminder email commands", async () => {
    const command: TimerReminderEmailCommand = {
      to: "user@example.com",
      timerId: "timer_123",
      label: "Launch",
      targetDate: "2026-05-25T12:00:00.000Z",
      timezone: "Europe/Warsaw",
      offsetMinutes: 10,
      occurrenceAt: "2026-05-25T12:00:00.000Z",
      transactionId: "timer-reminder:timer_123:10m:2026-05-25T12:00:00.000Z",
    }

    await expect(nullMailProvider.sendTimerReminderEmail(command)).resolves.toBeUndefined()
  })

  it("getMailProvider returns the stable null instance", () => {
    expect(getMailProvider()).toBe(nullMailProvider)
    expect(getMailProvider()).toBe(getMailProvider())
  })
})
