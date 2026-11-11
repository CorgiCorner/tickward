"use client"

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react"

import { formatMessage } from "@/lib/i18n/messages"
import type { Space, Timer } from "@/lib/types"
import { cn } from "@/lib/utils"

import { useDialNow } from "./dial-clock"
import { DialFocusMode } from "./dial-focus-mode"
import { DialHero } from "./dial-hero"
import { defaultDialSelection, dialSections, type DialSectionId } from "./dial-model"
import { DialRow } from "./dial-row"
import type { DialMomentLedger } from "./milestone-moment"

// Section keys: dial.section.pinned / dial.section.thisWeek / dial.section.later /
// dial.section.countingUp.
function sectionTitle(id: DialSectionId) {
  return formatMessage(`dial.section.${id}`)
}

/** The colour a timer is drawn in: its own, else its space's, else the primary token. */
export function dialTimerColor(timer: Timer, spaces?: ReadonlyArray<Space>): string | undefined {
  return timer.color || spaces?.find((space) => space.id === timer.spaceId)?.color || undefined
}

export type DialDashboardProps = Readonly<{
  /** The app's timers. Archived timers are left out. */
  timers: ReadonlyArray<Timer>
  /** Keep the order of `timers` inside each section (the dashboard's sort) instead of sorting by date. */
  keepOrder?: boolean
  /** Spaces, for timers that take their colour from their space. */
  spaces?: ReadonlyArray<Space>
  /** Controlled selection. Leave it out to let the dashboard keep its own. */
  selectedId?: string | null
  /** First selection when uncontrolled; the first pinned timer, else the nearest countdown. */
  defaultSelectedId?: string
  onSelectedIdChange?: (id: string) => void
  /** Shows the pin button on the selected timer. */
  onTogglePin?: (timer: Timer) => void
  /** The selected timer's actions menu trigger. */
  renderActions?: (timer: Timer) => ReactNode
  /** Opens with the selected timer in focus mode. */
  defaultFocusOpen?: boolean
  /** Remembers which milestone moments already played; this device's storage by default. */
  momentLedger?: DialMomentLedger
  /** Lets the milestone badge replay the moment. For stories only. */
  allowMomentReplay?: boolean
  className?: string
}>

/**
 * The dial view of the dashboard: the selected timer on a live tick dial on the left, the
 * timers in the iPhone sections on the right. In a container narrower than 768 px the dial sits
 * on top of the list.
 */
export function DialDashboard(props: DialDashboardProps) {
  const { timers } = props
  // Sections and the default selection follow the minute; rows and the dial tick on their own.
  const minute = useDialNow(60_000)
  const keepOrder = props.keepOrder ?? false
  const sections = useMemo(() => dialSections(timers, minute, { keepOrder }), [timers, minute, keepOrder])
  const fallbackId = useMemo(() => defaultDialSelection(timers, minute, { keepOrder }), [timers, minute, keepOrder])
  const [ownSelection, setOwnSelection] = useState<string | null>(props.defaultSelectedId ?? null)
  const { onSelectedIdChange } = props
  const idPrefix = useId()
  const [focusOpen, setFocusOpen] = useState(props.defaultFocusOpen ?? false)
  const focusButtonRef = useRef<HTMLButtonElement>(null)
  const closeFocus = useCallback(() => setFocusOpen(false), [])

  const requestedId = props.selectedId !== undefined ? props.selectedId : ownSelection
  const visible = (id: string | null | undefined) => timers.find((timer) => timer.id === id && !timer.archivedAt)
  const selected = visible(requestedId) ?? visible(fallbackId)

  const select = useCallback(
    (id: string) => {
      setOwnSelection(id)
      onSelectedIdChange?.(id)
    },
    [onSelectedIdChange],
  )

  if (!selected) {
    return (
      <div
        className={cn(
          "rounded-[16px] border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground",
          props.className,
        )}
      >
        {formatMessage("dial.empty")}
      </div>
    )
  }

  return (
    <div className={cn("@container font-sans", props.className)} data-testid="dial-dashboard">
      <div className="grid items-start gap-6 @3xl:grid-cols-[376px_minmax(0,1fr)]">
        <DialHero
          timer={selected}
          color={dialTimerColor(selected, props.spaces)}
          onTogglePin={props.onTogglePin}
          onOpenFocus={() => setFocusOpen(true)}
          focusButtonRef={focusButtonRef}
          momentLedger={props.momentLedger}
          allowMomentReplay={props.allowMomentReplay}
          actions={props.renderActions?.(selected)}
        />
        <div className="flex min-w-0 flex-col gap-3.5" role="group" aria-label={formatMessage("dial.list.label")}>
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`${idPrefix}-${section.id}`} className="flex flex-col gap-2">
              <h3
                id={`${idPrefix}-${section.id}`}
                className="m-0 px-1 pt-0.5 text-xs font-medium leading-4 text-muted-foreground"
              >
                {sectionTitle(section.id)}
              </h3>
              <div className="flex flex-col gap-2">
                {section.timers.map((timer) => (
                  <DialRow
                    key={timer.id}
                    timer={timer}
                    color={dialTimerColor(timer, props.spaces)}
                    selected={timer.id === selected.id}
                    onSelect={select}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <DialFocusMode
        open={focusOpen}
        timer={selected}
        color={dialTimerColor(selected, props.spaces)}
        onClose={closeFocus}
        returnFocusRef={focusButtonRef}
      />
    </div>
  )
}
