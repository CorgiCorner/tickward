"use client"

import { useSyncExternalStore } from "react"

import { nowSnapshot, subscribeToNow } from "@/lib/now-ticker.client"

export function useNow() {
  return useSyncExternalStore(subscribeToNow, nowSnapshot, nowSnapshot)
}
