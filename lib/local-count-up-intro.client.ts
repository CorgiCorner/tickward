"use client"

import { useSyncExternalStore } from "react"

// Keep the existing key so the first-use note does not reappear after upgrade.
export const LOCAL_COUNT_UP_INTRO_DISMISSED_KEY = "tickward:attention-intro-dismissed:v1"
const LOCAL_COUNT_UP_INTRO_CHANGED = "tickward:count-up-intro-dismissed-changed"

function readSnapshot() {
  return globalThis.localStorage?.getItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY) === "1"
}

function readServerSnapshot() {
  return false
}

function subscribe(callback: () => void) {
  if (globalThis.window === undefined) return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCAL_COUNT_UP_INTRO_DISMISSED_KEY) callback()
  }
  globalThis.addEventListener("storage", onStorage)
  globalThis.addEventListener(LOCAL_COUNT_UP_INTRO_CHANGED, callback)
  return () => {
    globalThis.removeEventListener("storage", onStorage)
    globalThis.removeEventListener(LOCAL_COUNT_UP_INTRO_CHANGED, callback)
  }
}

export function setLocalCountUpIntroDismissed(dismissed: boolean, storage = globalThis.localStorage) {
  if (dismissed) storage.setItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY, "1")
  else storage.removeItem(LOCAL_COUNT_UP_INTRO_DISMISSED_KEY)
  if (globalThis.window !== undefined) globalThis.dispatchEvent(new Event(LOCAL_COUNT_UP_INTRO_CHANGED))
}

export function useLocalCountUpIntroDismissed() {
  return useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot)
}
