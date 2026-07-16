import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useTimerNotifications } from "@/components/use-notifications"
import { makeTimer } from "@/test/factories"

const notificationCalls: Array<{ title: string; options?: NotificationOptions }> = []

class NotificationMock {
  static permission: NotificationPermission = "granted"

  constructor(title: string, options?: NotificationOptions) {
    notificationCalls.push({ title, options })
  }
}

describe("useTimerNotifications", () => {
  beforeEach(() => {
    notificationCalls.length = 0
    NotificationMock.permission = "granted"
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: NotificationMock,
    })
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: NotificationMock,
    })
    localStorage.setItem("notificationsEnabled", "1")
  })

  it("fires once when a notify-enabled timer crosses its target", async () => {
    const timer = makeTimer({
      id: "timer-a",
      label: "Deploy",
      targetDate: "2026-05-24T00:00:00.000Z",
      notify: true,
    })

    const { rerender } = renderHook(({ nowMs }) => useTimerNotifications([timer], nowMs), {
      initialProps: { nowMs: Date.parse("2026-05-23T23:59:59.000Z") },
    })

    expect(notificationCalls).toEqual([])

    rerender({ nowMs: Date.parse("2026-05-24T00:00:00.000Z") })
    await vi.waitFor(() => {
      expect(notificationCalls).toEqual([
        {
          title: "Timer finished!",
          options: {
            body: "Deploy started counting up in Project",
            data: {
              kind: "timer",
              projectId: "local",
              timerId: "timer-a",
              targetAtMs: Date.parse("2026-05-24T00:00:00.000Z"),
            },
            tag: "timer-local-timer-a",
          },
        },
      ])
    })

    rerender({ nowMs: Date.parse("2026-05-24T00:00:01.000Z") })
    expect(notificationCalls).toHaveLength(1)
  })

  it("fires once per occurrence for a recurring timer with a past anchor", () => {
    const timer = makeTimer({
      id: "weekly",
      label: "Standup",
      targetDate: "2026-05-10T00:00:00.000Z", // anchor stays in the past, never mutated
      notify: true,
      recurrence: { type: "weekly", enabled: true },
    })

    const { rerender } = renderHook(({ nowMs }) => useTimerNotifications([timer], nowMs), {
      initialProps: { nowMs: Date.parse("2026-05-23T23:59:59.000Z") },
    })
    // Most recent occurrence (May 17) elapsed long ago — no stale fire.
    expect(notificationCalls).toEqual([])

    // Crossing the May 24 occurrence fires once.
    rerender({ nowMs: Date.parse("2026-05-24T00:00:00.000Z") })
    expect(notificationCalls).toEqual([{ title: "Timer finished!", options: { body: "Standup", tag: "timer-weekly" } }])

    // Same occurrence, a tick later — no duplicate.
    rerender({ nowMs: Date.parse("2026-05-24T00:00:01.000Z") })
    expect(notificationCalls).toHaveLength(1)

    // Next week's occurrence fires again.
    rerender({ nowMs: Date.parse("2026-05-31T00:00:00.000Z") })
    expect(notificationCalls).toHaveLength(2)
  })

  it("skips archived, non-notify, disabled-global, and non-granted timers", () => {
    const targetDate = "2026-05-24T00:00:00.000Z"
    const nowMs = Date.parse(targetDate)

    renderHook(() =>
      useTimerNotifications(
        [
          makeTimer({ id: "archived", targetDate, notify: true, archivedAt: "2026-05-23T00:00:00.000Z" }),
          makeTimer({ id: "silent", targetDate, notify: false }),
        ],
        nowMs,
      ),
    )
    expect(notificationCalls).toEqual([])

    localStorage.setItem("notificationsEnabled", "0")
    renderHook(() => useTimerNotifications([makeTimer({ id: "globally-disabled", targetDate, notify: true })], nowMs))
    expect(notificationCalls).toEqual([])

    localStorage.setItem("notificationsEnabled", "1")
    NotificationMock.permission = "denied"
    renderHook(() => useTimerNotifications([makeTimer({ id: "denied", targetDate, notify: true })], nowMs))
    expect(notificationCalls).toEqual([])
  })
})
