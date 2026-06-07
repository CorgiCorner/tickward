import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  enabledBackendNotificationChannels,
  reconcileTimerNotificationSchedule,
  sendTimerFinishedNotification,
  timerNotificationTransactionId,
  timerNotificationSettings,
} from "@/lib/notification-service.server"
import { makeTimer } from "@/test/factories"

const scheduler = {
  scheduleTimerNotification: vi.fn(),
  cancelTimerNotification: vi.fn(),
}

const deliveryProvider = {
  sendTimerFinished: vi.fn(),
}

const deliveryTracker = {
  trackDelivery: vi.fn(),
}

const outboxRepository = {
  upsertIntent: vi.fn(),
  markIntentResult: vi.fn(),
}

describe("notification service", () => {
  beforeEach(() => {
    scheduler.scheduleTimerNotification.mockReset()
    scheduler.cancelTimerNotification.mockReset()
    scheduler.scheduleTimerNotification.mockResolvedValue(undefined)
    scheduler.cancelTimerNotification.mockResolvedValue(undefined)
    deliveryProvider.sendTimerFinished.mockReset()
    deliveryProvider.sendTimerFinished.mockResolvedValue([{ channel: "email", status: "sent", providerId: "resend" }])
    deliveryTracker.trackDelivery.mockReset()
    deliveryTracker.trackDelivery.mockResolvedValue(undefined)
    outboxRepository.upsertIntent.mockReset()
    outboxRepository.upsertIntent.mockResolvedValue(undefined)
    outboxRepository.markIntentResult.mockReset()
    outboxRepository.markIntentResult.mockResolvedValue(undefined)
  })

  it("normalizes legacy notify flags and filters backend delivery channels", () => {
    const settings = timerNotificationSettings(makeTimer({ notify: true }))

    expect(settings.enabled).toBe(true)
    expect(enabledBackendNotificationChannels(settings)).toEqual([])

    expect(
      enabledBackendNotificationChannels({
        ...settings,
        channels: { in_app: true, push: true, email: true, sms: false, chat: true },
      }),
    ).toEqual(["push", "email", "chat"])
  })

  it("cancels timer work when no account-level backend channels are enabled", async () => {
    const timer = makeTimer({
      id: "timer_123",
      notification: { enabled: true },
    })

    await reconcileTimerNotificationSchedule({
      timer,
      dependencies: { notificationScheduler: scheduler },
    })

    expect(scheduler.scheduleTimerNotification).not.toHaveBeenCalled()
    expect(scheduler.cancelTimerNotification).toHaveBeenCalledWith("timer_123")
  })

  it("cancels archived or local-only timers instead of scheduling backend work", async () => {
    await reconcileTimerNotificationSchedule({
      timer: makeTimer({
        id: "local-only",
        notification: { enabled: true },
      }),
      dependencies: { notificationScheduler: scheduler },
    })

    await reconcileTimerNotificationSchedule({
      timer: makeTimer({
        id: "archived",
        archivedAt: "2026-06-05T10:00:00.000Z",
        notification: { enabled: true },
      }),
      dependencies: { notificationScheduler: scheduler },
    })

    expect(scheduler.scheduleTimerNotification).not.toHaveBeenCalled()
    expect(scheduler.cancelTimerNotification).toHaveBeenCalledWith("local-only")
    expect(scheduler.cancelTimerNotification).toHaveBeenCalledWith("archived")
  })

  it("skips finished timer delivery without account-level backend channels", async () => {
    const timer = makeTimer({
      id: "timer_123",
      notification: { enabled: true },
    })

    const result = await sendTimerFinishedNotification({
      timer,
      recipient: { email: "ada@example.com" },
      dependencies: {
        notificationDeliveryProvider: deliveryProvider,
        notificationDeliveryTracker: deliveryTracker,
        notificationOutboxRepository: outboxRepository,
      },
    })

    expect(result).toEqual([])
    expect(timerNotificationTransactionId(timer)).toBe("timer-finished:timer_123:2026-05-25T12:00:00.000Z")
    expect(outboxRepository.upsertIntent).not.toHaveBeenCalled()
    expect(deliveryProvider.sendTimerFinished).not.toHaveBeenCalled()
    expect(deliveryTracker.trackDelivery).not.toHaveBeenCalled()
    expect(outboxRepository.markIntentResult).not.toHaveBeenCalled()
  })
})
