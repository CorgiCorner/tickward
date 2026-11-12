"use client"

import { BellIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"

import { MOTION_MS, prefersReducedMotion } from "@/components/dashboard/motion"
import { GroupedNumber } from "@/components/timer-detail/grouped-number"
import {
  formatDetailDate,
  formatDetailDateTime,
  formatMilestoneAmount,
  formatShortDate,
} from "@/components/timer-detail/timer-detail-format"
import {
  countdownProgress,
  countUpTrack,
  detailTarget,
  isCountUpTimer,
} from "@/components/timer-detail/timer-detail-model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useNow } from "@/components/use-now"
import { formatMessage, formatPluralMessage } from "@/lib/i18n/messages"
import type { Space, Timer } from "@/lib/types"
import { cn, getCountdownParts, pad2 } from "@/lib/utils"

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
    /** The whole timer adds its date, note and a progress bar with reminder or milestone markers. */
    timer?: Timer
    /** The timer's colour (its own or its space's) for the progress bar. */
    accentColor?: string
    space?: Space
    nowMs?: number
    /** Where focus goes when focus mode closes; the element focused when it opened by default. */
    returnFocusRef?: RefObject<HTMLElement | null>
    onClose: () => void
  }>,
) {
  const { accentColor, nowMs, onClose, open, returnFocusRef, space, targetDateIsoUtc, timer, timerLabel } = props
  const spaceName = space?.name.trim()
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [themeId, setThemeId] = useState<FocusThemeId>(() => (open ? readStoredThemeId() : "default"))
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
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

    const timeoutMs = prefersReducedMotion() ? 0 : MOTION_MS.exit
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

    previousFocusRef.current =
      returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const focusId = globalThis.setTimeout(() => closeButtonRef.current?.focus(), 0)
    return () => globalThis.clearTimeout(focusId)
  }, [mounted, open, returnFocusRef])

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
      const lastFocusable = focusableElements.at(-1) ?? dialog
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
    // Native dialog shown via the `open` attribute (not showModal) so the
    // existing mount/unmount transition, manual focus trap, and Escape
    // handling keep working unchanged. w-full overrides the user-agent
    // fit-content sizing so the dialog stays full-bleed like the old div.
    <dialog
      ref={dialogRef}
      open
      aria-modal="true"
      aria-labelledby="timer-focus-mode-title"
      tabIndex={-1}
      data-testid="timer-focus-mode"
      className={cn(
        // Fades in over 220 ms while the content settles from 0.98; leaves in 160 ms.
        // Reduced motion keeps the fade.
        "fixed inset-0 z-[100] isolate flex min-h-dvh w-full flex-col overflow-hidden transition-opacity ease-fade",
        visible ? "opacity-100 duration-enter" : "opacity-0 duration-exit",
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

      <main
        data-testid="timer-focus-mode-content"
        className={cn(
          "flex flex-1 items-center justify-center px-4 py-20 transition-transform ease-move motion-reduce:scale-100 sm:px-8",
          visible ? "scale-100 duration-enter" : "scale-[0.98] duration-exit",
        )}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <h1
            id="timer-focus-mode-title"
            className="max-w-full text-balance text-3xl font-semibold tracking-[-0.01em] sm:text-[44px] sm:leading-tight"
          >
            {timerLabel}
          </h1>
          {spaceName ? (
            <Badge
              variant="outline"
              className="mt-3 block max-w-full whitespace-normal break-words [overflow-wrap:anywhere] overflow-visible border-current/30 text-current"
              style={space?.color ? { borderColor: space.color } : undefined}
            >
              {spaceName}
            </Badge>
          ) : null}
          {timer ? <FocusTimerDetails timer={timer} nowMs={nowMs} detailClassName={theme.detailClassName} /> : null}
          <FocusCounter
            targetDateIsoUtc={targetDateIsoUtc}
            nowMs={nowMs}
            labelClassName={theme.detailClassName}
            className="mt-12 sm:mt-16"
          />
          {timer ? (
            <FocusProgress
              timer={timer}
              nowMs={nowMs}
              accentColor={accentColor}
              detailClassName={theme.detailClassName}
            />
          ) : null}
        </div>
      </main>

      <fieldset
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 sm:bottom-11 sm:gap-3.5"
        aria-label={formatMessage("timer.focus.themePicker")}
      >
        {TIMER_FOCUS_THEMES.map((candidate) => {
          const label = formatMessage(candidate.labelKey)
          const selected = candidate.id === theme.id
          return (
            <button
              key={candidate.id}
              type="button"
              data-selected={selected || undefined}
              className={cn(
                "size-8 rounded-full border border-foreground/15 outline-none transition-transform duration-press ease-move hover:scale-110 active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:hover:scale-100 sm:size-9",
                candidate.swatchClassName,
                selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "",
              )}
              aria-label={label}
              aria-pressed={selected}
              title={label}
              onClick={() => {
                setThemeId(candidate.id)
                storeThemeId(candidate.id)
              }}
            />
          )
        })}
      </fieldset>
    </dialog>
  )
}

function FocusUnit(props: Readonly<{ value: ReactNode; label: string; labelClassName?: string; muted?: boolean }>) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3 sm:gap-[18px]">
      <span
        className={cn(
          "text-5xl font-semibold leading-none tracking-normal sm:text-7xl md:text-8xl lg:text-[104px]",
          props.muted && "opacity-55",
        )}
        suppressHydrationWarning
      >
        {props.value}
      </span>
      <span className={cn("text-xs uppercase leading-none tracking-[0.14em] sm:text-base", props.labelClassName)}>
        {props.label}
      </span>
    </div>
  )
}

function FocusCounterUnits(
  props: Readonly<{ targetDateIsoUtc: string; nowMs: number; className?: string; labelClassName?: string }>,
) {
  const parts = getCountdownParts(props.targetDateIsoUtc, props.nowMs)
  return (
    <div
      data-testid="timer-focus-counter"
      className={cn(
        "flex w-full max-w-4xl items-start justify-center gap-5 font-mono tabular-nums sm:gap-12 lg:gap-[72px]",
        props.className,
      )}
    >
      {/* references: timer.countdown.dayUnit.one / timer.countdown.dayUnit.few / timer.countdown.dayUnit.many */}
      <FocusUnit
        value={<GroupedNumber value={parts.days} />}
        label={formatPluralMessage("timer.countdown.dayUnit", parts.days)}
        labelClassName={props.labelClassName}
      />
      <FocusUnit
        value={pad2(parts.hours)}
        label={formatMessage("timerDetail.unit.hours")}
        labelClassName={props.labelClassName}
      />
      <FocusUnit
        value={pad2(parts.minutes)}
        label={formatMessage("timerDetail.unit.minutes")}
        labelClassName={props.labelClassName}
      />
      <FocusUnit
        value={pad2(parts.seconds)}
        label={formatMessage("timerDetail.unit.seconds")}
        labelClassName={props.labelClassName}
        muted
      />
    </div>
  )
}

function LiveFocusCounter(props: Readonly<{ targetDateIsoUtc: string; className?: string; labelClassName?: string }>) {
  const nowMs = useNow()
  return <FocusCounterUnits {...props} nowMs={nowMs} />
}

function FocusCounter(
  props: Readonly<{ targetDateIsoUtc: string; nowMs?: number; className?: string; labelClassName?: string }>,
) {
  if (props.nowMs !== undefined) return <FocusCounterUnits {...props} nowMs={props.nowMs} />
  return <LiveFocusCounter {...props} />
}

function FocusTimerDetails(props: Readonly<{ timer: Timer; nowMs?: number; detailClassName: string }>) {
  const liveNowMs = useNow()
  const nowMs = props.nowMs ?? liveNowMs
  const { timer } = props
  const countsUp = isCountUpTimer(timer)
  const target = detailTarget(timer, nowMs)
  const when = countsUp
    ? formatMessage("timerDetail.since", { date: formatDetailDate(target, timer.timezone) ?? target })
    : (formatDetailDateTime(target, timer.timezone, nowMs) ?? target)
  const note = timer.description?.trim()

  return (
    <>
      <p className={cn("mt-3 text-sm sm:mt-3.5 sm:text-xl", props.detailClassName)}>
        {[when, timer.timezone].join(" · ")}
      </p>
      {note ? <p className="mt-2 max-w-2xl text-balance text-sm opacity-75 sm:mt-2.5 sm:text-lg">{note}</p> : null}
    </>
  )
}

type FocusMarker = { key: string; fraction: number; label?: string }

function FocusProgress(
  props: Readonly<{ timer: Timer; nowMs?: number; accentColor?: string; detailClassName: string }>,
) {
  const liveNowMs = useNow()
  const nowMs = props.nowMs ?? liveNowMs
  const { timer } = props

  let fraction: number
  let markers: FocusMarker[]
  let start: string
  let end: string
  if (isCountUpTimer(timer)) {
    const track = countUpTrack(timer, nowMs)
    if (!track) return null
    fraction = track.fraction
    markers = track.markers.map((marker) => ({ key: `${marker.at}:${marker.unit}`, fraction: marker.fraction }))
    start = formatMessage("timerDetail.progress.started", {
      date: formatShortDate(track.startMs, timer.timezone) ?? "",
    })
    end = `${formatMilestoneAmount(track.next)} · ${formatShortDate(track.nextMs, timer.timezone) ?? ""}`
  } else {
    const progress = countdownProgress(timer, nowMs)
    if (!progress) return null
    fraction = progress.fraction
    const nextReminder = progress.reminders.find((reminder) => !reminder.past)
    markers = progress.reminders.map((reminder) => ({
      key: String(reminder.offsetMinutes),
      fraction: reminder.fraction,
      label:
        reminder === nextReminder
          ? formatMessage("timer.focus.reminderMarker", {
              date: formatDetailDateTime(reminder.atMs, timer.timezone, nowMs) ?? "",
            })
          : undefined,
    }))
    start = formatMessage("timerDetail.progress.started", {
      date: formatDetailDateTime(progress.startMs, timer.timezone, nowMs) ?? "",
    })
    end = formatDetailDateTime(progress.targetMs, timer.timezone, nowMs) ?? ""
  }

  return (
    <div data-testid="timer-focus-progress" className="mt-12 flex w-full max-w-[720px] flex-col gap-3 sm:mt-16">
      <div role="img" aria-label={`${start} · ${end}`} className="relative h-1.5 rounded-full bg-current/15">
        <div
          className={cn("h-full min-w-1.5 rounded-full", props.accentColor ? "" : "bg-blue-600 dark:bg-blue-500")}
          style={{
            width: `${fraction * 100}%`,
            ...(props.accentColor ? { backgroundColor: props.accentColor } : {}),
          }}
        />
        {markers.map((marker) => (
          <span
            key={marker.key}
            data-testid="timer-focus-marker"
            className="absolute -top-[5px] h-4 w-0.5 -translate-x-1/2 rounded-full bg-current/50"
            style={{ left: `${marker.fraction * 100}%` }}
          >
            {marker.label ? (
              <span
                className={cn(
                  "absolute bottom-5 flex items-center gap-2 whitespace-nowrap text-xs sm:text-[15px]",
                  marker.fraction > 0.6 ? "-mr-2 right-0" : "-ml-2 left-0",
                  props.detailClassName,
                )}
              >
                <BellIcon aria-hidden="true" className="size-3.5 sm:size-[18px]" />
                {marker.label}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <div className={cn("flex justify-between gap-4 text-xs sm:text-[15px]", props.detailClassName)}>
        <span className="text-left">{start}</span>
        <span className="text-right">{end}</span>
      </div>
    </div>
  )
}
