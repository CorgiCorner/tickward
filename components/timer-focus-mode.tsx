"use client"

import { XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { CountdownDisplay } from "@/components/countdown-display"
import { Button } from "@/components/ui/button"
import { useNow } from "@/components/use-now"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

export { TimerFocusAction } from "@/components/timer-focus-action"

export const TIMER_FOCUS_THEME_STORAGE_KEY = "tickward:timer-focus-theme"

type FocusThemeId = "default" | "sky" | "mint" | "rose" | "lavender" | "butter"

type FocusTheme = {
  id: FocusThemeId
  labelKey:
    | "timer.focus.theme.default"
    | "timer.focus.theme.sky"
    | "timer.focus.theme.mint"
    | "timer.focus.theme.rose"
    | "timer.focus.theme.lavender"
    | "timer.focus.theme.butter"
  backgroundClassName: string
  textClassName: string
  detailClassName: string
  swatchClassName: string
}

export const TIMER_FOCUS_THEMES: readonly FocusTheme[] = [
  {
    id: "default",
    labelKey: "timer.focus.theme.default",
    backgroundClassName: "bg-zinc-50 dark:bg-black",
    textClassName: "text-foreground",
    detailClassName: "text-muted-foreground",
    swatchClassName: "bg-zinc-50 dark:bg-zinc-950",
  },
  {
    id: "sky",
    labelKey: "timer.focus.theme.sky",
    backgroundClassName:
      "bg-gradient-to-br from-sky-100 via-cyan-50 to-white dark:from-sky-950 dark:via-cyan-950 dark:to-slate-950",
    textClassName: "text-slate-950 dark:text-sky-50",
    detailClassName: "text-slate-700 dark:text-sky-200",
    swatchClassName:
      "bg-gradient-to-br from-sky-200 via-cyan-100 to-white dark:from-sky-900 dark:via-cyan-900 dark:to-slate-950",
  },
  {
    id: "mint",
    labelKey: "timer.focus.theme.mint",
    backgroundClassName:
      "bg-gradient-to-br from-emerald-100 via-teal-50 to-white dark:from-emerald-950 dark:via-teal-950 dark:to-slate-950",
    textClassName: "text-slate-950 dark:text-emerald-50",
    detailClassName: "text-slate-700 dark:text-emerald-200",
    swatchClassName:
      "bg-gradient-to-br from-emerald-200 via-teal-100 to-white dark:from-emerald-900 dark:via-teal-900 dark:to-slate-950",
  },
  {
    id: "rose",
    labelKey: "timer.focus.theme.rose",
    backgroundClassName:
      "bg-gradient-to-br from-rose-100 via-orange-50 to-white dark:from-rose-950 dark:via-orange-950 dark:to-stone-950",
    textClassName: "text-stone-950 dark:text-rose-50",
    detailClassName: "text-stone-700 dark:text-rose-200",
    swatchClassName:
      "bg-gradient-to-br from-rose-200 via-orange-100 to-white dark:from-rose-900 dark:via-orange-900 dark:to-stone-950",
  },
  {
    id: "lavender",
    labelKey: "timer.focus.theme.lavender",
    backgroundClassName:
      "bg-gradient-to-br from-violet-100 via-fuchsia-50 to-white dark:from-violet-950 dark:via-fuchsia-950 dark:to-slate-950",
    textClassName: "text-slate-950 dark:text-violet-50",
    detailClassName: "text-slate-700 dark:text-violet-200",
    swatchClassName:
      "bg-gradient-to-br from-violet-200 via-fuchsia-100 to-white dark:from-violet-900 dark:via-fuchsia-900 dark:to-slate-950",
  },
  {
    id: "butter",
    labelKey: "timer.focus.theme.butter",
    backgroundClassName:
      "bg-gradient-to-br from-yellow-100 via-lime-50 to-white dark:from-yellow-950 dark:via-lime-950 dark:to-stone-950",
    textClassName: "text-stone-950 dark:text-yellow-50",
    detailClassName: "text-stone-700 dark:text-yellow-200",
    swatchClassName:
      "bg-gradient-to-br from-yellow-200 via-lime-100 to-white dark:from-yellow-900 dark:via-lime-900 dark:to-stone-950",
  },
]

function isFocusThemeId(value: string | null): value is FocusThemeId {
  return TIMER_FOCUS_THEMES.some((theme) => theme.id === value)
}

function readStoredThemeId(): FocusThemeId {
  if (globalThis.window === undefined) return "default"

  try {
    const stored = globalThis.localStorage.getItem(TIMER_FOCUS_THEME_STORAGE_KEY)
    return isFocusThemeId(stored) ? stored : "default"
  } catch {
    return "default"
  }
}

function storeThemeId(themeId: FocusThemeId) {
  if (globalThis.window === undefined) return

  try {
    globalThis.localStorage.setItem(TIMER_FOCUS_THEME_STORAGE_KEY, themeId)
  } catch {
    // Focus mode still works when storage is unavailable.
  }
}

function prefersReducedMotion() {
  if (globalThis.window === undefined || !("matchMedia" in globalThis.window)) return false
  return globalThis.window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

function focusableElementsIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true",
  )
}

export function TimerFocusMode(
  props: Readonly<{
    open: boolean
    timerLabel: string
    targetDateIsoUtc: string
    nowMs?: number
    onClose: () => void
  }>,
) {
  const { nowMs, onClose, open, targetDateIsoUtc, timerLabel } = props
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [themeId, setThemeId] = useState<FocusThemeId>(() => (open ? readStoredThemeId() : "default"))
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const theme = useMemo(
    () => TIMER_FOCUS_THEMES.find((candidate) => candidate.id === themeId) ?? TIMER_FOCUS_THEMES[0],
    [themeId],
  )

  useEffect(() => {
    if (!open) return

    const openId = globalThis.setTimeout(() => {
      setThemeId(readStoredThemeId())
      setMounted(true)
    }, 0)
    return () => globalThis.clearTimeout(openId)
  }, [open])

  useEffect(() => {
    if (!mounted) return

    const openId = globalThis.setTimeout(() => setVisible(open), 0)
    return () => globalThis.clearTimeout(openId)
  }, [mounted, open])

  useEffect(() => {
    if (open || !mounted) return

    const timeoutMs = prefersReducedMotion() ? 0 : 160
    const closeStartId = globalThis.setTimeout(() => setVisible(false), 0)
    const closeId = globalThis.setTimeout(() => setMounted(false), timeoutMs)
    return () => {
      globalThis.clearTimeout(closeStartId)
      globalThis.clearTimeout(closeId)
    }
  }, [mounted, open])

  useEffect(() => {
    if (!mounted) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mounted])

  useEffect(() => {
    if (!open || !mounted) return

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusId = globalThis.setTimeout(() => closeButtonRef.current?.focus(), 0)
    return () => globalThis.clearTimeout(focusId)
  }, [mounted, open])

  useEffect(() => {
    if (mounted) return

    const previousFocus = previousFocusRef.current
    if (previousFocus?.isConnected) previousFocus.focus()
    previousFocusRef.current = null
  }, [mounted])

  useEffect(() => {
    if (!mounted) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== "Tab") return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusableElements = focusableElementsIn(dialog)
      const firstFocusable = focusableElements[0] ?? dialog
      const lastFocusable = focusableElements[focusableElements.length - 1] ?? dialog
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const focusIsInsideDialog = activeElement ? dialog.contains(activeElement) : false

      if (!focusIsInsideDialog) {
        event.preventDefault()
        ;(event.shiftKey ? lastFocusable : firstFocusable).focus()
        return
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
        return
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="timer-focus-mode-title"
      tabIndex={-1}
      data-testid="timer-focus-mode"
      className={cn(
        "fixed inset-0 z-[100] isolate flex min-h-dvh flex-col overflow-hidden transition-opacity duration-200 motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0",
        theme.backgroundClassName,
        theme.textClassName,
      )}
    >
      <Button
        ref={closeButtonRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        className="absolute right-4 top-4 z-10 rounded-full bg-background/20 text-current backdrop-blur-sm hover:bg-background/35 focus-visible:bg-background/35 sm:right-6 sm:top-6"
        aria-label={formatMessage("timer.focus.exit")}
        title={formatMessage("timer.focus.exit")}
        onClick={onClose}
      >
        <XIcon className="size-5" />
      </Button>

      <main className="flex flex-1 items-center justify-center px-4 py-20 sm:px-8">
        <div className="mx-auto grid w-full max-w-5xl gap-10 text-center sm:gap-14">
          <h1 id="timer-focus-mode-title" className="text-balance text-3xl font-semibold sm:text-5xl">
            {timerLabel}
          </h1>
          <FocusCountdownDisplay
            targetDateIsoUtc={targetDateIsoUtc}
            nowMs={nowMs}
            className="mx-auto w-full max-w-4xl gap-3 sm:gap-8"
            unitClassName="min-w-0 gap-3"
            unitValueClassName="text-5xl tracking-normal sm:text-7xl md:text-8xl"
            unitLabelClassName={cn("text-xs tracking-normal sm:text-sm", theme.detailClassName)}
            sinceClassName={cn("mb-4 text-xs tracking-normal sm:text-sm", theme.detailClassName)}
          />
        </div>
      </main>

      <div
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/25 px-3 py-2 opacity-100 backdrop-blur-md transition-opacity hover:opacity-100 focus-within:opacity-100 pointer-fine:opacity-55 pointer-fine:hover:opacity-100 pointer-fine:focus-within:opacity-100 motion-reduce:transition-none"
        role="group"
        aria-label={formatMessage("timer.focus.themePicker")}
      >
        {TIMER_FOCUS_THEMES.map((candidate) => {
          const label = formatMessage(candidate.labelKey)
          return (
            <button
              key={candidate.id}
              type="button"
              className={cn(
                "size-5 rounded-full border border-foreground/20 shadow-sm outline-none transition-transform hover:scale-110 focus-visible:ring-ring/60 focus-visible:ring-[3px] motion-reduce:transition-none",
                candidate.swatchClassName,
                candidate.id === theme.id ? "ring-2 ring-foreground/55 ring-offset-2 ring-offset-background/60" : "",
              )}
              aria-label={label}
              aria-pressed={candidate.id === theme.id}
              title={label}
              onClick={() => {
                setThemeId(candidate.id)
                storeThemeId(candidate.id)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function LiveFocusCountdownDisplay(
  props: Readonly<{
    className?: string
    targetDateIsoUtc: string
    unitClassName?: string
    unitLabelClassName?: string
    unitValueClassName?: string
    sinceClassName?: string
  }>,
) {
  const nowMs = useNow()

  return <CountdownDisplay {...props} nowMs={nowMs} />
}

function FocusCountdownDisplay(
  props: Readonly<{
    className?: string
    targetDateIsoUtc: string
    nowMs?: number
    unitClassName?: string
    unitLabelClassName?: string
    unitValueClassName?: string
    sinceClassName?: string
  }>,
) {
  if (props.nowMs !== undefined) return <CountdownDisplay {...props} nowMs={props.nowMs} />

  return <LiveFocusCountdownDisplay {...props} />
}
