import { describe, expect, it } from "vitest"

import {
  DEFAULT_RESOLVED_TIMER_NOTIFICATION_SETTINGS,
  normalizeNotificationSound,
  normalizeTimerNotificationSettings,
  notificationSoundSource,
} from "./notification-preferences"

describe("notification preferences", () => {
  it("maps the legacy notify flag into enabled settings", () => {
    expect(normalizeTimerNotificationSettings(undefined, true)).toEqual({
      ...DEFAULT_RESOLVED_TIMER_NOTIFICATION_SETTINGS,
      enabled: true,
    })
  })

  it("keeps timer-level settings to the enabled flag only", () => {
    expect(normalizeTimerNotificationSettings({ enabled: true }, false)).toEqual({
      enabled: true,
      channels: {
        in_app: true,
        push: false,
        email: false,
        sms: false,
        chat: false,
      },
      presentation: { fullPageAlarm: false, sound: "none", requireInteraction: false },
    })
  })

  it("normalizes unsupported sound values to none", () => {
    expect(normalizeNotificationSound("alarm")).toBe("alarm")
    expect(normalizeNotificationSound("glass")).toBe("glass")
    expect(normalizeNotificationSound("loud")).toBe("none")
  })

  it("uses Safari-compatible MP3 notification sound assets", () => {
    expect(notificationSoundSource("polite")).toBe("/sounds/notifications/polite.mp3")
    expect(notificationSoundSource("glass")).toBe("/sounds/notifications/glass.mp3")
    expect(notificationSoundSource("chord")).toBe("/sounds/notifications/chord.mp3")
    expect(notificationSoundSource("alarm")).toBe("/sounds/notifications/alarmed.mp3")
    expect(notificationSoundSource("none")).toBeNull()
  })
})
