"use client"

import { useEffect, useRef, useState } from "react"

import {
  readLocalNotificationPreferences,
  type LocalNotificationPreferences,
} from "@/lib/local-notification-preferences.client"
import { formatMessage } from "@/lib/i18n/messages"
import { playNotificationSound } from "@/lib/notification-audio.client"
import type { NotificationSound } from "@/lib/notification-preferences"
import type { Timer } from "@/lib/types"
import { recurrenceHistory } from "@/lib/utils"

export type LocalTimerAlarm = {
  timerId: string
  label: string
  boundary: string
  fullPageAlarm: boolean
}

type TimerAlarmCandidate = {
  boundary: string
  firedKey: string
  fullPageAlarm: boolean
  sound: NotificationSound
  timer: Timer
}

function sendSWNotification(title: string, options: NotificationOptions) {
  void navigator.serviceWorker.ready.then((reg) => {
    if (reg.active) {
      reg.active.postMessage({ type: "SHOW_NOTIFICATION", title, options })
    }
  })
}

function showNotification(title: string, options: NotificationOptions) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    sendSWNotification(title, options)
  } else {
    try {
      new Notification(title, options)
    } catch {
      // Notifications may fail in some contexts.
    }
  }
}

function browserNotificationAllowed(preferences: LocalNotificationPreferences) {
  return (
    preferences.browserNotificationsEnabled && "Notification" in globalThis && Notification.permission === "granted"
  )
}

function timerAlarmBoundary(timer: Timer, nowMs: number) {
  return timer.recurrence?.enabled ? recurrenceHistory(timer, nowMs).last : timer.targetDate
}

function timerAlarmCandidate(
  timer: Timer,
  nowMs: number,
  preferences: LocalNotificationPreferences,
  firedKeys: Set<string>,
): TimerAlarmCandidate | null {
  if (timer.archivedAt) return null
  if (timer.notify !== true && timer.notification?.enabled !== true) return null

  const boundary = timerAlarmBoundary(timer, nowMs)
  if (!boundary) return null

  const boundaryMs = new Date(boundary).getTime()
  const firedKey = `${timer.id}::${boundary}`
  const readyToFire = boundaryMs > nowMs - 1500 && boundaryMs <= nowMs && !firedKeys.has(firedKey)
  if (!readyToFire) return null

  const fullPageAlarm = preferences.fullPageAlarm
  const sound = preferences.sound
  if (!browserNotificationAllowed(preferences) && !fullPageAlarm && sound === "none") return null

  return { boundary, firedKey, fullPageAlarm, sound, timer }
}

function showTimerBrowserNotification(candidate: TimerAlarmCandidate, preferences: LocalNotificationPreferences) {
  if (!browserNotificationAllowed(preferences)) return

  showNotification(formatMessage("notifications.timerFinishedTitle"), {
    body: candidate.timer.label,
    tag: `timer-${candidate.timer.id}`,
  })
}

function triggerFullPageAlarm(candidate: TimerAlarmCandidate, setAlarm: (alarm: LocalTimerAlarm) => void) {
  if (!candidate.fullPageAlarm) return

  window.setTimeout(() => {
    setAlarm({
      timerId: candidate.timer.id,
      label: candidate.timer.label,
      boundary: candidate.boundary,
      fullPageAlarm: true,
    })
  }, 0)
}

export function useLocalTimerAlarms(timers: Timer[], nowMs: number) {
  const firedRef = useRef<Set<string>>(new Set())
  const [alarm, setAlarm] = useState<LocalTimerAlarm | null>(null)

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration may fail in some contexts.
      })
    }
  }, [])

  useEffect(() => {
    if (globalThis.window === undefined) return
    const preferences = readLocalNotificationPreferences()

    for (const timer of timers) {
      const candidate = timerAlarmCandidate(timer, nowMs, preferences, firedRef.current)
      if (!candidate) continue

      firedRef.current.add(candidate.firedKey)
      showTimerBrowserNotification(candidate, preferences)
      void playNotificationSound(candidate.sound)
      triggerFullPageAlarm(candidate, setAlarm)
    }
  }, [timers, nowMs])

  useEffect(() => {
    const currentIds = new Set(timers.map((t) => t.id))
    for (const key of firedRef.current) {
      const id = key.split("::")[0]
      if (!currentIds.has(id)) firedRef.current.delete(key)
    }
  }, [timers])

  return {
    alarm,
    dismissAlarm: () => setAlarm(null),
  }
}
