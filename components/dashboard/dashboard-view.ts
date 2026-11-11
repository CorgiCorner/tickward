"use client"

import { useCallback, useSyncExternalStore } from "react"

// The dashboard's view, remembered on this device. Phones show the full cards
// in one column for both grid and list; "dial" is the dial dashboard on every
// width (`DialDashboardView` in ./dial-dashboard-view).

export const DASHBOARD_VIEWS = ["grid", "list", "dial"] as const
export type DashboardView = (typeof DASHBOARD_VIEWS)[number]

export const DEFAULT_DASHBOARD_VIEW: DashboardView = "grid"
export const DASHBOARD_VIEW_STORAGE_KEY = "tickward:dashboard-view"
/** The last grid or list choice, so turning the dial off on a phone brings it back. */
export const DASHBOARD_CARDS_VIEW_STORAGE_KEY = "tickward:dashboard-view:cards"
const CHANGE_EVENT = "tickward:dashboard-view:change"

export function isDashboardView(value: unknown): value is DashboardView {
  return typeof value === "string" && (DASHBOARD_VIEWS as readonly string[]).includes(value)
}

export function readDashboardView(): DashboardView {
  try {
    const stored = localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY)
    return isDashboardView(stored) ? stored : DEFAULT_DASHBOARD_VIEW
  } catch {
    return DEFAULT_DASHBOARD_VIEW
  }
}

/** The view to return to when the dial is turned off: the last grid or list choice. */
export function readCardsDashboardView(): DashboardView {
  try {
    const stored = localStorage.getItem(DASHBOARD_CARDS_VIEW_STORAGE_KEY)
    return isDashboardView(stored) && stored !== "dial" ? stored : DEFAULT_DASHBOARD_VIEW
  } catch {
    return DEFAULT_DASHBOARD_VIEW
  }
}

export function writeDashboardView(view: DashboardView) {
  try {
    const previous = readDashboardView()
    if (view === "dial" && previous !== "dial") localStorage.setItem(DASHBOARD_CARDS_VIEW_STORAGE_KEY, previous)
    else if (view !== "dial") localStorage.setItem(DASHBOARD_CARDS_VIEW_STORAGE_KEY, view)
    localStorage.setItem(DASHBOARD_VIEW_STORAGE_KEY, view)
  } catch {
    // Without storage the choice lasts for this page view only.
  }
  globalThis.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DASHBOARD_VIEW_STORAGE_KEY) onChange()
  }
  globalThis.addEventListener("storage", onStorage)
  globalThis.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    globalThis.removeEventListener("storage", onStorage)
    globalThis.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function serverSnapshot(): DashboardView {
  return DEFAULT_DASHBOARD_VIEW
}

export function useDashboardView() {
  const view = useSyncExternalStore(subscribe, readDashboardView, serverSnapshot)
  const setView = useCallback((next: DashboardView) => writeDashboardView(next), [])
  return [view, setView] as const
}
