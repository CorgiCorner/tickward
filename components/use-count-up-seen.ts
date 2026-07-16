"use client"

import { useCallback, useEffect, useRef } from "react"

export const COUNT_UP_SEEN_DWELL_MS = 1_200
export const COUNT_UP_SEEN_BATCH_MS = 500
export const COUNT_UP_SEEN_INTERSECTION_RATIO = 0.5

type CountUpDwellState = {
  documentVisible: boolean
  windowFocused: boolean
  intersectionRatio: number
  focusWithin: boolean
}

type CountUpDwellTracker = {
  update: (next: Partial<CountUpDwellState>) => void
  dispose: () => void
}

type TimerScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>
  clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => void
}

const defaultScheduler: TimerScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
}

function qualifiesForSeen(state: CountUpDwellState) {
  return (
    state.documentVisible &&
    state.windowFocused &&
    (state.focusWithin || state.intersectionRatio >= COUNT_UP_SEEN_INTERSECTION_RATIO)
  )
}

export function createCountUpDwellTracker(
  onDwell: () => void,
  options: Readonly<{
    dwellMs?: number
    scheduler?: TimerScheduler
    initialState?: Partial<CountUpDwellState>
  }> = {},
): CountUpDwellTracker {
  const scheduler = options.scheduler ?? defaultScheduler
  const dwellMs = options.dwellMs ?? COUNT_UP_SEEN_DWELL_MS
  let state: CountUpDwellState = {
    documentVisible: false,
    windowFocused: false,
    intersectionRatio: 0,
    focusWithin: false,
    ...options.initialState,
  }
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null
  let complete = false

  const cancel = () => {
    if (timer === null) return
    scheduler.clearTimeout(timer)
    timer = null
  }

  const evaluate = () => {
    if (complete || timer !== null || !qualifiesForSeen(state)) return
    timer = scheduler.setTimeout(() => {
      timer = null
      if (!complete && qualifiesForSeen(state)) {
        complete = true
        onDwell()
      }
    }, dwellMs)
  }

  return {
    update(next) {
      if (complete) return
      state = { ...state, ...next }
      if (!qualifiesForSeen(state)) cancel()
      else evaluate()
    },
    dispose() {
      complete = true
      cancel()
    },
  }
}

export function useCountUpSeenCard(eventKey: string | null, onSeen: (key: string) => void) {
  const onSeenRef = useRef(onSeen)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onSeenRef.current = onSeen
  }, [onSeen])

  const ref = useCallback(
    (node: HTMLElement | null) => {
      cleanupRef.current?.()
      cleanupRef.current = null
      if (!node || !eventKey) return

      const tracker = createCountUpDwellTracker(() => onSeenRef.current(eventKey))
      const updateAppState = () =>
        tracker.update({
          documentVisible: document.visibilityState === "visible",
          windowFocused: document.hasFocus(),
        })
      const onWindowBlur = () => tracker.update({ windowFocused: false })
      const onFocusIn = () => {
        updateAppState()
        tracker.update({ focusWithin: true })
      }
      const onFocusOut = (event: FocusEvent) => {
        tracker.update({ focusWithin: node.contains(event.relatedTarget as Node | null) })
      }

      const observer =
        typeof IntersectionObserver === "undefined"
          ? null
          : new IntersectionObserver(
              (entries) => {
                const entry = entries.find((candidate) => candidate.target === node)
                if (!entry) return
                tracker.update({ intersectionRatio: entry.isIntersecting ? entry.intersectionRatio : 0 })
              },
              { threshold: [0, COUNT_UP_SEEN_INTERSECTION_RATIO] },
            )

      observer?.observe(node)
      document.addEventListener("visibilitychange", updateAppState)
      globalThis.addEventListener("focus", updateAppState)
      globalThis.addEventListener("blur", onWindowBlur)
      node.addEventListener("focusin", onFocusIn)
      node.addEventListener("focusout", onFocusOut)
      updateAppState()

      cleanupRef.current = () => {
        observer?.disconnect()
        document.removeEventListener("visibilitychange", updateAppState)
        globalThis.removeEventListener("focus", updateAppState)
        globalThis.removeEventListener("blur", onWindowBlur)
        node.removeEventListener("focusin", onFocusIn)
        node.removeEventListener("focusout", onFocusOut)
        tracker.dispose()
      }
    },
    [eventKey],
  )

  useEffect(
    () => () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    },
    [],
  )

  return ref
}

export function useBatchedCountUpSeen(onSeen: (keys: string[]) => void, delayMs = COUNT_UP_SEEN_BATCH_MS) {
  const onSeenRef = useRef(onSeen)
  const pendingRef = useRef(new Set<string>())
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)

  useEffect(() => {
    onSeenRef.current = onSeen
  }, [onSeen])

  const flush = useCallback(() => {
    if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current)
    timerRef.current = null
    if (pendingRef.current.size === 0) return
    const keys = [...pendingRef.current]
    pendingRef.current.clear()
    onSeenRef.current(keys)
  }, [])

  useEffect(() => flush, [flush])

  return useCallback(
    (key: string) => {
      pendingRef.current.add(key)
      if (timerRef.current !== null) return
      timerRef.current = globalThis.setTimeout(flush, delayMs)
    },
    [delayMs, flush],
  )
}
