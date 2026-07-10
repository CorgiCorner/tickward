"use client"

import type { MessageKey } from "@/lib/i18n/messages"
import { readLocalNotificationPreferences } from "@/lib/local-notification-preferences.client"

type TimerAlertReadiness = { ready: true; mode: "local" | "system" } | { ready: false; messageKey: MessageKey }

function browserAlertsReady() {
  return globalThis.window !== undefined && "Notification" in globalThis && Notification.permission === "granted"
}

export function timerAlertReadiness(input: { signedIn: boolean }): TimerAlertReadiness {
  if (!input.signedIn) return { ready: false, messageKey: "notifications.signInToConfigure" }

  const preferences = readLocalNotificationPreferences()
  if (preferences.localAlarmEnabled) return { ready: true, mode: "local" }
  if (preferences.browserNotificationsEnabled && browserAlertsReady()) return { ready: true, mode: "system" }

  return { ready: false, messageKey: "notifications.configureInSettings" }
}
