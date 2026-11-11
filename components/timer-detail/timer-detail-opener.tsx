"use client"

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react"

import type { TimerDetailContentProps } from "@/components/timer-detail/timer-detail-dialog"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

const loadTimerDetailDialog = () => import("@/components/timer-detail/timer-detail-dialog")

const LazyTimerDetailDialog = lazy(() => loadTimerDetailDialog().then((mod) => ({ default: mod.TimerDetailDialog })))

// The view's code loads once per page while it is idle, so the first click opens it at
// once; the dialog itself mounts only for the card someone reaches for.
let preloadRequested = false
function preloadTimerDetailDialog() {
  if (preloadRequested) return
  preloadRequested = true
  void loadTimerDetailDialog().catch(() => {
    // A failed preload is retried by the first open.
    preloadRequested = false
  })
}

export type TimerDetailOpenerProps = TimerDetailContentProps & {
  className?: string
  /** Called when the view opens, so the host can get what the view hands over to ready. */
  onOpen?: () => void
}

/**
 * The detail view of one timer, split in two: `trigger` is the button that covers its
 * positioned parent (the card) and may be placed in more than one layout tree (phone and
 * desktop); `dialog` is the one detail view they share, rendered once. Card controls that must
 * stay clickable need to stack above the trigger (`relative z-10`). The view grows from the
 * trigger that opened it and returns focus to it when it closes. The view mounts on intent
 * only: a pointer pressing, focus or a key reaching a trigger.
 */
export function useTimerDetailOpener(props: Readonly<TimerDetailOpenerProps>): {
  trigger: ReactNode
  dialog: ReactNode
} {
  const { className, onOpen, ...detailProps } = props
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [initialFocus, setInitialFocus] = useState<"first" | "panel">("first")
  const originRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (preloadRequested || typeof globalThis.requestIdleCallback !== "function") return
    const id = globalThis.requestIdleCallback(preloadTimerDetailDialog, { timeout: 3000 })
    return () => globalThis.cancelIdleCallback(id)
  }, [])

  function reach(event: SyntheticEvent<HTMLButtonElement>) {
    originRef.current = event.currentTarget
    setLoaded(true)
  }

  const trigger = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={formatMessage("timerDetail.open", { label: props.timer.label })}
      data-timer-detail-opener=""
      className={cn(
        "absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      onPointerDown={reach}
      onFocus={reach}
      onKeyDown={reach}
      onClick={(event) => {
        reach(event)
        // A click or tap has a detail count; Enter and Space on the button do not.
        setInitialFocus(event.detail > 0 ? "panel" : "first")
        setOpen(true)
        onOpen?.()
      }}
    />
  )

  const dialog = loaded ? (
    <Suspense fallback={null}>
      <LazyTimerDetailDialog
        {...detailProps}
        open={open}
        onOpenChange={setOpen}
        originRef={originRef}
        initialFocus={initialFocus}
      />
    </Suspense>
  ) : null

  return { trigger, dialog }
}

/** A single trigger with its detail view, for a card that has one layout tree. */
export function TimerDetailOpener(props: Readonly<TimerDetailOpenerProps>) {
  const { trigger, dialog } = useTimerDetailOpener(props)
  return (
    <>
      {trigger}
      {dialog}
    </>
  )
}
