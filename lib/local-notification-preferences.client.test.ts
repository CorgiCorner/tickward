import { describe, expect, it } from "vitest"

import { LOCAL_NOTIFICATION_STORAGE_KEYS } from "@/lib/notification-preferences"
import {
  readLocalNotificationPreferences,
  setLocalBrowserNotificationsEnabled,
  setLocalFullPageAlarmEnabled,
  setLocalInAppNotificationsEnabled,
  setLocalNotificationSound,
} from "./local-notification-preferences.client"

describe("local notification preferences", () => {
  it("defaults to disabled local and browser notification preferences", () => {
    expect(readLocalNotificationPreferences()).toEqual({
      browserNotificationsEnabled: false,
      fullPageAlarm: false,
      inAppNotifications: true,
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
      inAppNotifications: true,
      sound: "polite",
      localAlarmEnabled: true,
    })

    setLocalInAppNotificationsEnabled(false)

    expect(readLocalNotificationPreferences()).toEqual({
      browserNotificationsEnabled: true,
      fullPageAlarm: true,
      inAppNotifications: false,
      sound: "polite",
      localAlarmEnabled: true,
    })

    setLocalBrowserNotificationsEnabled(false)
    setLocalFullPageAlarmEnabled(false)
    setLocalInAppNotificationsEnabled(true)
    setLocalNotificationSound("none")

    expect(readLocalNotificationPreferences()).toEqual({
      browserNotificationsEnabled: false,
      fullPageAlarm: false,
      inAppNotifications: true,
      sound: "none",
      localAlarmEnabled: false,
    })
  })
})
