"use client"

import { useSyncExternalStore } from "react"

import {
  DEFAULT_TIMEZONE_STORAGE_KEY,
  getBrowserTimeZone,
  getDefaultTimeZone,
  isSupportedTimeZone,
} from "@/lib/timezones"

const DEFAULT_TIMEZONE_CHANGED_EVENT = "tickward:default-timezone-changed"

function emitDefaultTimeZoneChanged() {
  globalThis.window?.dispatchEvent(new Event(DEFAULT_TIMEZONE_CHANGED_EVENT))
}

function defaultTimeZoneServerSnapshot() {
  return "UTC"
}

function subscribeDefaultTimeZone(callback: () => void) {
  if (globalThis.window === undefined) return () => {}

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DEFAULT_TIMEZONE_STORAGE_KEY) callback()
  }
  const onLocalChange = () => callback()

  globalThis.window.addEventListener("storage", onStorage)
  globalThis.window.addEventListener(DEFAULT_TIMEZONE_CHANGED_EVENT, onLocalChange)

  return () => {
    globalThis.window.removeEventListener("storage", onStorage)
    globalThis.window.removeEventListener(DEFAULT_TIMEZONE_CHANGED_EVENT, onLocalChange)
  }
}

export function setDefaultTimeZonePreference(timezone: string) {
  if (globalThis.window === undefined || !isSupportedTimeZone(timezone)) return false
  globalThis.localStorage.setItem(DEFAULT_TIMEZONE_STORAGE_KEY, timezone)
  emitDefaultTimeZoneChanged()
  return true
}

export function resetDefaultTimeZonePreference() {
  if (globalThis.window === undefined) return
  globalThis.localStorage.removeItem(DEFAULT_TIMEZONE_STORAGE_KEY)
  emitDefaultTimeZoneChanged()
}

export function useDefaultTimeZone() {
  return useSyncExternalStore(subscribeDefaultTimeZone, getDefaultTimeZone, defaultTimeZoneServerSnapshot)
}

export function useBrowserTimeZone() {
  return useSyncExternalStore(subscribeDefaultTimeZone, getBrowserTimeZone, defaultTimeZoneServerSnapshot)
}
