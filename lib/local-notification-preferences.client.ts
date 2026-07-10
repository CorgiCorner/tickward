"use client"

import { useMemo, useSyncExternalStore } from "react"

import {
  LOCAL_NOTIFICATION_STORAGE_KEYS,
  normalizeNotificationSound,
  type NotificationSound,
} from "@/lib/notification-preferences"

export type LocalNotificationPreferences = {
  browserNotificationsEnabled: boolean
  fullPageAlarm: boolean
  inAppNotifications: boolean
  sound: NotificationSound
  localAlarmEnabled: boolean
}

const LOCAL_NOTIFICATION_PREFERENCES_CHANGED = "tickward:local-notification-preferences-changed"
const LOCAL_NOTIFICATION_STORAGE_KEY_SET = new Set<string>(Object.values(LOCAL_NOTIFICATION_STORAGE_KEYS))

function browserStorage(): Storage | null {
  if (globalThis.window === undefined) return null
  return globalThis.localStorage
}

function preferencesSnapshot(preferences: LocalNotificationPreferences) {
  return [
    preferences.browserNotificationsEnabled ? "1" : "0",
    preferences.fullPageAlarm ? "1" : "0",
    preferences.inAppNotifications ? "1" : "0",
    preferences.sound,
  ].join("|")
}

function preferencesFromSnapshot(snapshot: string): LocalNotificationPreferences {
  const [browserNotificationsEnabled, fullPageAlarm, inAppNotifications, sound] = snapshot.split("|")
  const normalizedSound = normalizeNotificationSound(sound)
  const fullPageEnabled = fullPageAlarm === "1"
  const inAppEnabled = inAppNotifications !== "0"

  return {
    browserNotificationsEnabled: browserNotificationsEnabled === "1",
    fullPageAlarm: fullPageEnabled,
    inAppNotifications: inAppEnabled,
    sound: normalizedSound,
    localAlarmEnabled: fullPageEnabled || normalizedSound !== "none",
  }
}

function localPreferencesSnapshot() {
  return preferencesSnapshot(readLocalNotificationPreferences())
}

function serverPreferencesSnapshot() {
  return preferencesSnapshot(readLocalNotificationPreferences(null))
}

function emitLocalPreferencesChanged() {
  if (globalThis.window === undefined) return
  globalThis.window.dispatchEvent(new Event(LOCAL_NOTIFICATION_PREFERENCES_CHANGED))
}

function subscribeLocalPreferences(callback: () => void) {
  if (globalThis.window === undefined) return () => {}

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || LOCAL_NOTIFICATION_STORAGE_KEY_SET.has(event.key)) callback()
  }
  const onLocalChange = () => callback()

  globalThis.window.addEventListener("storage", onStorage)
  globalThis.window.addEventListener(LOCAL_NOTIFICATION_PREFERENCES_CHANGED, onLocalChange)

  return () => {
    globalThis.window.removeEventListener("storage", onStorage)
    globalThis.window.removeEventListener(LOCAL_NOTIFICATION_PREFERENCES_CHANGED, onLocalChange)
  }
}

export function readLocalNotificationPreferences(storage = browserStorage()): LocalNotificationPreferences {
  const fullPageAlarm = storage?.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.fullPageAlarm) === "1"
  const inAppNotifications = storage?.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.inAppNotifications) !== "0"
  const sound = normalizeNotificationSound(storage?.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.sound))

  return {
    browserNotificationsEnabled: storage?.getItem(LOCAL_NOTIFICATION_STORAGE_KEYS.enabled) === "1",
    fullPageAlarm,
    inAppNotifications,
    sound,
    localAlarmEnabled: fullPageAlarm || sound !== "none",
  }
}

export function setLocalBrowserNotificationsEnabled(enabled: boolean, storage = browserStorage()) {
  storage?.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.enabled, enabled ? "1" : "0")
  emitLocalPreferencesChanged()
}

export function setLocalFullPageAlarmEnabled(enabled: boolean, storage = browserStorage()) {
  storage?.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.fullPageAlarm, enabled ? "1" : "0")
  emitLocalPreferencesChanged()
}

export function setLocalInAppNotificationsEnabled(enabled: boolean, storage = browserStorage()) {
  storage?.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.inAppNotifications, enabled ? "1" : "0")
  emitLocalPreferencesChanged()
}

export function setLocalNotificationSound(sound: NotificationSound, storage = browserStorage()) {
  storage?.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.sound, sound)
  emitLocalPreferencesChanged()
}

export function useLocalNotificationPreferences() {
  const snapshot = useSyncExternalStore(subscribeLocalPreferences, localPreferencesSnapshot, serverPreferencesSnapshot)
  return useMemo(() => preferencesFromSnapshot(snapshot), [snapshot])
}
