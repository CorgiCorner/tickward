"use client"

import { XIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react"

import { useCountUpFormat } from "@/components/dashboard/count-up-format"
import { MOTION_MS, prefersReducedMotion } from "@/components/dashboard/motion"
import { Button } from "@/components/ui/button"
import { formatMessage } from "@/lib/i18n/messages"
import type { Timer } from "@/lib/types"

import styles from "./dial.module.css"
import { useDialNow } from "./dial-clock"
import { DialFace } from "./dial-face"
import { dialCount, formatDialDateLine, formatDialLegend } from "./dial-format"
import { dialTimerView } from "./dial-model"

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"
const CLOSE_MS = MOTION_MS.exit

function FocusBody(props: Readonly<{ timer: Timer; color?: string }>) {
  const { timer } = props
  const nowMs = useDialNow()
  const view = dialTimerView(timer, nowMs)
  const [countFormat] = useCountUpFormat(timer.id)
  const count = dialCount(timer, view, nowMs, countFormat)
  return (
    <div
      className="flex w-full flex-col items-center px-4 text-center"
      style={props.color ? ({ "--dial-color": props.color } as CSSProperties) : undefined}
    >
      <h2 className="m-0 flex max-w-full items-center gap-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] sm:text-[34px] sm:leading-10">
        <span aria-hidden="true" className="size-2.5 flex-none rounded-full bg-[var(--dial-color,var(--primary))]" />
        <span className="truncate">{timer.label}</span>
      </h2>
      <p className="mt-2.5 text-[15px] leading-[22px] text-muted-foreground sm:text-[17px] sm:leading-6">
        {formatDialDateLine(timer, view, nowMs)}
      </p>
      <DialFace
        size="focus"
        className="mt-7"
        progress={view.progress}
        color={props.color}
        timerKey={timer.id}
        readout={{ value: count.value, unit: count.unit, clock: view.readout.clock }}
      />
      <p className="mt-4 min-h-[22px] text-[15px] leading-[22px] text-muted-foreground">
        {formatDialLegend(view, nowMs)}
      </p>
    </div>
  )
}

export type DialFocusModeProps = Readonly<{
  open: boolean
  timer: Timer
  color?: string
  onClose: () => void
  /** Gets focus back when focus mode closes; the element focused before opening otherwise. */
  returnFocusRef?: RefObject<HTMLElement | null>
}>

/**
 * The selected timer on a large dial, full screen. Escape and the close button leave it, focus
 * stays inside while it is open and returns to the opener when it closes.
 */
export function DialFocusMode(props: DialFocusModeProps) {
  const { open, onClose, returnFocusRef } = props
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const showId = globalThis.setTimeout(() => setMounted(true), 0)
      return () => globalThis.clearTimeout(showId)
    }
    const hideId = globalThis.setTimeout(() => setVisible(false), 0)
    const unmountId = globalThis.setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : CLOSE_MS)
    return () => {
      globalThis.clearTimeout(hideId)
      globalThis.clearTimeout(unmountId)
    }
  }, [open])

  useEffect(() => {
    if (!mounted || !open) return
    // One frame at the closed state first, so the opening transition runs.
    const frame = globalThis.requestAnimationFrame(() => {
      setVisible(true)
      closeRef.current?.focus()
    })
    return () => globalThis.cancelAnimationFrame(frame)
  }, [mounted, open])

  // A layout effect, so focus is back on the opener in the same commit that removes the dialog.
  // A passive cleanup runs a task later and leaves focus on the body in between.
  useLayoutEffect(() => {
    if (!mounted) return
    const previousOverflow = document.body.style.overflow
    const opener = returnFocusRef?.current ?? previousFocusRef.current
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [mounted, returnFocusRef])

  useEffect(() => {
    if (!mounted) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = focusable[0] ?? dialog
      const last = focusable.at(-1) ?? dialog
      const active = document.activeElement
      if (!dialog.contains(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    <dialog
      ref={dialogRef}
      open
      aria-modal="true"
      aria-label={formatMessage("dial.focus.label", { label: props.timer.label })}
      data-testid="dial-focus-mode"
      data-visible={visible}
      tabIndex={-1}
      className={`${styles.focus} fixed inset-0 z-[100] m-0 flex h-dvh max-h-none w-full max-w-none flex-col items-center justify-center overflow-hidden border-0 bg-background p-0 text-foreground font-sans`}
    >
      <Button
        ref={closeRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        className="absolute right-4 top-4 text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] sm:right-7 sm:top-6"
        aria-label={formatMessage("timer.focus.exit")}
        title={formatMessage("timer.focus.exit")}
        onClick={onClose}
      >
        <XIcon aria-hidden="true" className="size-5" />
      </Button>
      <FocusBody timer={props.timer} color={props.color} />
    </dialog>
  )
}
