import { describe, expect, it } from "vitest"

import {
  getNotificationScheduler,
  noopNotificationScheduler,
  type ScheduleTimerNotificationCommand,
} from "./notification-scheduler"

describe("notification scheduler", () => {
  it("noop schedules without throwing and resolves void", async () => {
    const command: ScheduleTimerNotificationCommand = {
      timerId: "timer_123",
      label: "Launch",
      targetDate: "2026-05-25T12:00:00.000Z",
      timezone: "Europe/Warsaw",
    }

    await expect(noopNotificationScheduler.scheduleTimerNotification(command)).resolves.toBeUndefined()
  })

  it("noop cancels without throwing and resolves void", async () => {
    await expect(noopNotificationScheduler.cancelTimerNotification("timer_123")).resolves.toBeUndefined()
  })

  it("getNotificationScheduler returns the stable noop instance", () => {
    expect(getNotificationScheduler()).toBe(noopNotificationScheduler)
    expect(getNotificationScheduler()).toBe(getNotificationScheduler())
  })
})
