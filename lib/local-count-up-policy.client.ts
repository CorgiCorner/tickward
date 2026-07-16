"use client"

import { useMemo, useSyncExternalStore } from "react"

import { DEFAULT_COUNT_UP_POLICY, normalizeCountUpPolicy, type CountUpPolicy } from "@/lib/count-up-policy"

// Keep the existing key so upgrades retain the user's policy.
export const LOCAL_COUNT_UP_POLICY_STORAGE_KEY = "tickward:attention-policy:v1"
const LOCAL_COUNT_UP_POLICY_CHANGED = "tickward:count-up-policy-changed"

function browserStorage(): Storage | null {
  return globalThis.window === undefined ? null : globalThis.localStorage
}

export function readLocalCountUpPolicy(storage = browserStorage()): CountUpPolicy {
  const raw = storage?.getItem(LOCAL_COUNT_UP_POLICY_STORAGE_KEY)
  if (!raw) return DEFAULT_COUNT_UP_POLICY
  try {
    return normalizeCountUpPolicy(JSON.parse(raw))
  } catch {
    return DEFAULT_COUNT_UP_POLICY
  }
}

function snapshot() {
  return JSON.stringify(readLocalCountUpPolicy())
}

function serverSnapshot() {
  return JSON.stringify(DEFAULT_COUNT_UP_POLICY)
}

export function subscribeLocalCountUpPolicy(callback: () => void) {
  if (globalThis.window === undefined) return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCAL_COUNT_UP_POLICY_STORAGE_KEY) callback()
  }
  globalThis.window.addEventListener("storage", onStorage)
  globalThis.window.addEventListener(LOCAL_COUNT_UP_POLICY_CHANGED, callback)
  return () => {
    globalThis.window.removeEventListener("storage", onStorage)
    globalThis.window.removeEventListener(LOCAL_COUNT_UP_POLICY_CHANGED, callback)
  }
}

export function setLocalCountUpPolicy(policy: CountUpPolicy, storage = browserStorage()) {
  const normalized = normalizeCountUpPolicy(policy)
  storage?.setItem(LOCAL_COUNT_UP_POLICY_STORAGE_KEY, JSON.stringify(normalized))
  if (globalThis.window !== undefined) globalThis.window.dispatchEvent(new Event(LOCAL_COUNT_UP_POLICY_CHANGED))
}

export function useLocalCountUpPolicy() {
  const value = useSyncExternalStore(subscribeLocalCountUpPolicy, snapshot, serverSnapshot)
  return useMemo(() => normalizeCountUpPolicy(JSON.parse(value)), [value])
}
