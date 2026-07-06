"use client"

import { useEffect, useRef, useState } from "react"

import {
  readLocalNotificationPreferences,
  type LocalNotificationPreferences,
  useLocalNotificationPreferences,
} from "@/lib/local-notification-preferences.client"
import { formatMessage } from "@/lib/i18n/messages"
import {
  playNotificationSound,
  prepareNotificationSound,
  primeNotificationAudio,
  resumeAudioContextIfNeeded,
  scheduleNotificationSound,
} from "@/lib/notification-audio.client"
import { timerNotificationsEnabled, type NotificationSound } from "@/lib/notification-preferences"
import type { Timer } from "@/lib/types"
import { effectiveTargetDate, recurrenceHistory } from "@/lib/utils"

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

type ScheduleEntry = {
  boundaryMs: number
  // Sound the primary Web Audio source was scheduled with. The scheduled buffer
  // is locked in at arm time, so if the user changes (or mutes) the sound while
  // the countdown is running we must cancel and reschedule — keying the reconcile
  // on boundaryMs alone would keep playing the stale arm-time sound.
  sound: NotificationSound
  cancelSound?: () => void
  timeoutId: number
}

// At most 15 minutes ahead: keeps setTimeout values sane and bounds
// Date.now()/ctx.currentTime drift to an acceptable level.
const HORIZON_MS = 15 * 60 * 1000

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

// Check whether this timer is eligible for any local alarm at all.
function timerIsAlarmable(timer: Timer): boolean {
  if (timer.archivedAt) return false
  if (!timerNotificationsEnabled(timer.notification, timer.notify)) return false
  return true
}

function timerAlarmCandidate(
  timer: Timer,
  prevNowMs: number,
  nowMs: number,
  preferences: LocalNotificationPreferences,
  firedKeys: Set<string>,
): TimerAlarmCandidate | null {
  if (!timerIsAlarmable(timer)) return null

  const boundary = timerAlarmBoundary(timer, nowMs)
  if (!boundary) return null

  const boundaryMs = new Date(boundary).getTime()
  const firedKey = `${timer.id}::${boundary}`
  // Fire whenever the boundary was crossed since the previous tick, so a tick
  // delayed by background-tab throttling still triggers the alarm instead of
  // silently skipping it.
  const readyToFire = boundaryMs > prevNowMs && boundaryMs <= nowMs && !firedKeys.has(firedKey)
  if (!readyToFire) return null

  const fullPageAlarm = preferences.fullPageAlarm
  const sound = preferences.sound
  if (!preferences.inAppNotifications) return null
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
  const localPreferences = useLocalNotificationPreferences()
  const firedRef = useRef<Set<string>>(new Set())
  const prevNowMsRef = useRef(nowMs)
  const scheduledRef = useRef<Map<string, ScheduleEntry>>(new Map())
  const [alarm, setAlarm] = useState<LocalTimerAlarm | null>(null)

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration may fail in some contexts.
      })
    }
  }, [])

  // On first user gesture: resume AudioContext, start keep-alive, decode the
  // current sound. Also attach a visibilitychange listener to re-resume the
  // context if the browser suspends it while the tab is hidden.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeAudioContextIfNeeded()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    const prime = () => {
      void primeNotificationAudio()
      // Eagerly decode the currently selected sound on gesture so the buffer
      // is ready before the user arms a timer.
      const { sound } = readLocalNotificationPreferences()
      void prepareNotificationSound(sound)
    }
    window.addEventListener("pointerdown", prime, { once: true })
    window.addEventListener("keydown", prime, { once: true })
    return () => {
      window.removeEventListener("pointerdown", prime)
      window.removeEventListener("keydown", prime)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Shared fire() routine — all trigger paths (scheduled primary + diff backstop)
  // funnel through here. Guards via firedRef so each firedKey fires exactly once.
  // Re-reads preferences at fire time so stale arm-time snapshots never deliver
  // sound/overlay against the user's current settings.
  // ---------------------------------------------------------------------------
  const fire = useRef((candidate: TimerAlarmCandidate, setAlarmFn: (alarm: LocalTimerAlarm) => void) => {
    if (firedRef.current.has(candidate.firedKey)) return
    firedRef.current.add(candidate.firedKey)

    // Re-read fresh prefs at fire time (fixes issue #4: stale arm-time snapshot).
    const freshPrefs = readLocalNotificationPreferences()
    if (!freshPrefs.inAppNotifications) return

    // Update candidate fields with fresh prefs so the notification/overlay
    // respect current user settings.
    const freshedCandidate: TimerAlarmCandidate = {
      ...candidate,
      fullPageAlarm: freshPrefs.fullPageAlarm,
      sound: freshPrefs.sound,
    }

    showTimerBrowserNotification(freshedCandidate, freshPrefs)

    // Only play the backstop sound if the scheduled audio handle did not
    // already (or will not) handle it. If the entry still exists in
    // scheduledRef, the scheduled source either played or was cancelled; in
    // both cases the backstop avoids double-play.
    const entry = scheduledRef.current.get(candidate.firedKey)
    if (!entry?.cancelSound) {
      void playNotificationSound(freshedCandidate.sound)
    }

    triggerFullPageAlarm(freshedCandidate, setAlarmFn)

    // Clean up the schedule entry now that it has fired.
    const sched = scheduledRef.current.get(candidate.firedKey)
    if (sched) {
      clearTimeout(sched.timeoutId)
      scheduledRef.current.delete(candidate.firedKey)
    }
  })

  // ---------------------------------------------------------------------------
  // SCHEDULING effect — arms primary sound (Web Audio hardware clock) +
  // primary notification/overlay (setTimeout) for every upcoming boundary
  // within HORIZON_MS. Runs whenever timers or nowMs change so it reconciles
  // removed/edited timers promptly.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (globalThis.window === undefined) return
    const preferences = readLocalNotificationPreferences()
    if (!preferences.inAppNotifications) {
      for (const entry of scheduledRef.current.values()) {
        entry.cancelSound?.()
        clearTimeout(entry.timeoutId)
      }
      scheduledRef.current.clear()
      return
    }
    const now = Date.now()

    const wantedKeys = new Set<string>()

    for (const timer of timers) {
      if (!timerIsAlarmable(timer)) continue

      // Compute the FORWARD (future) boundary, not the last-elapsed one.
      const boundaryIso = effectiveTargetDate(timer, now)
      if (!boundaryIso) continue

      const boundaryMs = new Date(boundaryIso).getTime()
      const msUntil = boundaryMs - now

      // Skip boundaries in the past or already fired.
      if (msUntil <= 0) continue
      if (msUntil > HORIZON_MS) continue

      const firedKey = `${timer.id}::${boundaryIso}`
      if (firedRef.current.has(firedKey)) continue

      // Check whether there is anything to do (preferences gate).
      if (!browserNotificationAllowed(preferences) && !preferences.fullPageAlarm && preferences.sound === "none") {
        continue
      }

      wantedKeys.add(firedKey)

      const existing = scheduledRef.current.get(firedKey)
      if (existing && existing.boundaryMs === boundaryMs && existing.sound === preferences.sound) {
        // Already scheduled at the correct time with the current sound — nothing to do.
        continue
      }

      // Cancel stale entry (boundary changed or selected sound changed).
      if (existing) {
        existing.cancelSound?.()
        clearTimeout(existing.timeoutId)
        scheduledRef.current.delete(firedKey)
      }

      // Build the candidate object used by fire().
      const candidate: TimerAlarmCandidate = {
        boundary: boundaryIso,
        firedKey,
        fullPageAlarm: preferences.fullPageAlarm,
        sound: preferences.sound,
        timer,
      }

      // PRIMARY: schedule sound via Web Audio hardware clock.
      // If the buffer isn't ready yet, try to decode it now and reschedule once
      // done (issue #3 fix: lazy decode for sounds changed after the gesture).
      let cancelSound: (() => void) | undefined
      const soundHandle = scheduleNotificationSound(preferences.sound, boundaryMs)
      if (soundHandle) {
        cancelSound = soundHandle.cancel
      } else if (preferences.sound !== "none") {
        // Buffer not decoded yet — kick off decode and reschedule when ready.
        void prepareNotificationSound(preferences.sound).then(() => {
          // Only reschedule if this key hasn't fired or been cancelled, and the
          // entry still refers to the same boundary and sound we decoded for
          // (a concurrent reconcile may have replaced it).
          if (firedRef.current.has(firedKey)) return
          const entry = scheduledRef.current.get(firedKey)
          if (!entry) return
          if (entry.boundaryMs !== boundaryMs || entry.sound !== preferences.sound) return
          if (entry.cancelSound) return
          const newHandle = scheduleNotificationSound(preferences.sound, boundaryMs)
          if (newHandle) {
            entry.cancelSound = newHandle.cancel
          }
        })
      }

      // PRIMARY: setTimeout for notification + overlay (background-safe; fires
      // even in hidden tabs unlike the stalled render loop).
      const fireFn = fire.current
      const timeoutId = window.setTimeout(() => {
        fireFn(candidate, setAlarm)
      }, msUntil)

      scheduledRef.current.set(firedKey, { boundaryMs, sound: preferences.sound, timeoutId, cancelSound })
    }

    // Cancel entries for timers that were removed, edited out of horizon, or
    // already disarmed.
    for (const [key, entry] of scheduledRef.current) {
      if (!wantedKeys.has(key)) {
        entry.cancelSound?.()
        clearTimeout(entry.timeoutId)
        scheduledRef.current.delete(key)
      }
    }
  }, [timers, nowMs, localPreferences])

  // ---------------------------------------------------------------------------
  // BACKSTOP diff effect — boundary-crossing detection on every tick.
  // Catches anything the primary paths missed (context not unlocked at arm time,
  // scheduling drift, tab woken after HORIZON_MS, etc.).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (globalThis.window === undefined) return
    const preferences = readLocalNotificationPreferences()
    const prevNowMs = prevNowMsRef.current
    prevNowMsRef.current = nowMs

    for (const timer of timers) {
      const candidate = timerAlarmCandidate(timer, prevNowMs, nowMs, preferences, firedRef.current)
      if (!candidate) continue

      fire.current(candidate, setAlarm)
    }
  }, [timers, nowMs])

  // ---------------------------------------------------------------------------
  // Cleanup on unmount: cancel all scheduled primaries.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Capture the ref value inside the effect; the linter warns when cleanup
    // closures access .current directly because the value may have changed by
    // the time the cleanup runs. For a mutable bookkeeping ref (not a DOM node)
    // this is intentional: we always want the live map at cleanup time.
    const scheduled = scheduledRef.current
    return () => {
      for (const entry of scheduled.values()) {
        entry.cancelSound?.()
        clearTimeout(entry.timeoutId)
      }
      scheduled.clear()
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Prune firedRef when timers are removed so keys don't accumulate forever.
  // ---------------------------------------------------------------------------
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
