import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TimerReminderDeliveryCommand } from "@/lib/notification-delivery"
import { createInAppNotificationChannelProvider } from "@/lib/adapters/in-app-notification-channel-provider.server"

const mocks = vi.hoisted(() => ({
  requirePrismaClient: vi.fn(),
}))

vi.mock("@/lib/db/prisma.server", () => ({
  requirePrismaClient: mocks.requirePrismaClient,
}))

const command: TimerReminderDeliveryCommand = {
  transactionId: "timer-reminder:timer_123:10m:2026-07-10T12:00:00.000Z",
  workflowIdentifier: "timer.reminder",
  timerId: "timer_123",
  projectId: "project_123",
  label: "Launch",
  timezone: "Europe/Warsaw",
  channels: ["in_app"],
  recipient: { subscriberId: "user_123" },
  offsetMinutes: 10,
  occurrenceAt: "2026-07-10T12:00:00.000Z",
  mode: "until",
}

describe("in-app notification channel provider", () => {
  beforeEach(() => {
    mocks.requirePrismaClient.mockReset()
  })

  it("upserts timer reminders by user and transaction id", async () => {
    const delegate = {
      upsert: vi.fn().mockResolvedValue({ id: "inbox_123" }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    }
    const userPreference = { findUnique: vi.fn().mockResolvedValue(null) }
    mocks.requirePrismaClient.mockReturnValue({ inAppNotification: delegate, userPreference })
    const provider = createInAppNotificationChannelProvider()

    await expect(provider.sendTimerReminder?.(command)).resolves.toEqual({
      channel: "in_app",
      status: "sent",
      providerId: "inbox",
      providerMessageId: "inbox_123",
      attemptCount: 1,
      successCount: 1,
      failureCount: 0,
    })

    expect(delegate.upsert).toHaveBeenCalledWith({
      where: {
        userId_transactionId: {
          userId: "user_123",
          transactionId: command.transactionId,
        },
      },
      update: expect.objectContaining({
        payload: {
          label: "Launch",
          offsetMinutes: 10,
          occurrenceAt: "2026-07-10T12:00:00.000Z",
          timezone: "Europe/Warsaw",
        },
        projectId: "project_123",
      }),
      create: expect.objectContaining({
        projectId: "project_123",
        transactionId: command.transactionId,
        userId: "user_123",
      }),
    })
    expect(userPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: "user_123" },
      select: { inAppNotifications: true },
    })
  })

  it.each([
    [0, "1000 days since Launch", "It's been 1000 days since Launch."],
    [1_440, "1000 days since Launch coming up", "Your 1000 days milestone since Launch is coming up."],
  ])("stores milestone celebration copy for offset %i", async (offsetMinutes, title, body) => {
    const delegate = {
      upsert: vi.fn().mockResolvedValue({ id: "inbox_123" }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    }
    mocks.requirePrismaClient.mockReturnValue({ inAppNotification: delegate })
    const provider = createInAppNotificationChannelProvider()

    await provider.sendTimerReminder?.({
      ...command,
      mode: "since",
      milestone: { unit: "days", count: 1000 },
      offsetMinutes,
    })

    expect(delegate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            title,
            body,
            milestone: { unit: "days", count: 1000 },
          }),
        }),
      }),
    )
  })

  it("skips the preference lookup when the command carries the resolved flag", async () => {
    const delegate = {
      upsert: vi.fn().mockResolvedValue({ id: "inbox_123" }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    }
    const userPreference = { findUnique: vi.fn() }
    mocks.requirePrismaClient.mockReturnValue({ inAppNotification: delegate, userPreference })
    const provider = createInAppNotificationChannelProvider()

    await expect(provider.sendTimerReminder?.({ ...command, inAppNotificationsEnabled: true })).resolves.toMatchObject({
      channel: "in_app",
      status: "sent",
    })

    expect(userPreference.findUnique).not.toHaveBeenCalled()
  })

  it("skips delivery without a lookup when the command resolves the preference to disabled", async () => {
    const delegate = {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    }
    const userPreference = { findUnique: vi.fn() }
    mocks.requirePrismaClient.mockReturnValue({ inAppNotification: delegate, userPreference })
    const provider = createInAppNotificationChannelProvider()

    await expect(provider.sendTimerReminder?.({ ...command, inAppNotificationsEnabled: false })).resolves.toMatchObject(
      { channel: "in_app", status: "skipped", reason: "preference_disabled" },
    )

    expect(userPreference.findUnique).not.toHaveBeenCalled()
    expect(delegate.upsert).not.toHaveBeenCalled()
  })

  it("skips timer reminders when in-app notifications are disabled", async () => {
    const delegate = {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    }
    mocks.requirePrismaClient.mockReturnValue({
      inAppNotification: delegate,
      userPreference: { findUnique: vi.fn().mockResolvedValue({ inAppNotifications: false }) },
    })
    const provider = createInAppNotificationChannelProvider()

    await expect(provider.sendTimerReminder?.(command)).resolves.toMatchObject({
      channel: "in_app",
      status: "skipped",
      reason: "preference_disabled",
      providerId: "inbox",
    })

    expect(delegate.upsert).not.toHaveBeenCalled()
  })

  it("skips timer reminders without a subscriber id", async () => {
    const provider = createInAppNotificationChannelProvider()

    await expect(provider.sendTimerReminder?.({ ...command, recipient: {} })).resolves.toMatchObject({
      channel: "in_app",
      status: "skipped",
      reason: "missing_recipient",
      providerId: "inbox",
    })
    expect(mocks.requirePrismaClient).not.toHaveBeenCalled()
  })
})
