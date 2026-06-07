import { describe, expect, it } from "vitest"

import { LOCAL_NOTIFICATION_STORAGE_KEYS } from "@/lib/notification-preferences"
import {
  readLocalNotificationPreferences,
  setLocalBrowserNotificationsEnabled,
  setLocalFullPageAlarmEnabled,
  setLocalNotificationSound,
} from "./local-notification-preferences.client"

describe("local notification preferences", () => {
  it("defaults to disabled local and browser notification preferences", () => {
    expect(readLocalNotificationPreferences()).toEqual({
      browserNotificationsEnabled: false,
      fullPageAlarm: false,
      sound: "none",
      localAlarmEnabled: false,
    })
  })

  it("normalizes unsupported values and writes local notification preferences", () => {
    localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.sound, "legacy")

    expect(readLocalNotificationPreferences().sound).toBe("none")

    setLocalBrowserNotificationsEnabled(true)
    setLocalFullPageAlarmEnabled(true)
    setLocalNotificationSound("polite")

    expect(readLocalNotificationPreferences()).toEqual({
      browserNotificationsEnabled: true,
      fullPageAlarm: true,
      sound: "polite",
      localAlarmEnabled: true,
    })

    setLocalBrowserNotificationsEnabled(false)
    setLocalFullPageAlarmEnabled(false)
    setLocalNotificationSound("none")

    expect(readLocalNotificationPreferences()).toEqual({
      browserNotificationsEnabled: false,
      fullPageAlarm: false,
      sound: "none",
      localAlarmEnabled: false,
    })
  })
})
