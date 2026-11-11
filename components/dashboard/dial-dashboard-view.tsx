"use client"

import { useCallback } from "react"
import { toast } from "sonner"

import { DialDashboard } from "@/components/dial"
import { TimerCard } from "@/components/timer-card"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import type { Space, Timer, TimerSortMode } from "@/lib/types"

export type DialDashboardViewProps = Readonly<{
  /** Active timers in the order the dashboard shows them, pinned first. */
  timers: Timer[]
  spaces: ReadonlyArray<Space>
  sortMode: TimerSortMode
  nowMs: number
}>

/**
 * The dial view of the dashboard (the third option in the view switch): the selected timer
 * on the live dial, the timers in their sections beside it. "Soonest" is the dial's own date
 * order; every other sort keeps the dashboard's order inside each section. The selected
 * timer's menu is the card's own, so its actions and dialogs behave exactly as on a card.
 */
export function DialDashboardView(props: DialDashboardViewProps) {
  const setPinnedTimer = useTimerStore((s) => s.setPinnedTimer)
  const { nowMs } = props

  const togglePin = useCallback(
    (timer: Timer) => {
      if (timer.archivedAt) return
      setPinnedTimer(timer.id)
      toast.success(formatMessage(timer.pinned ? "timer.unpinned" : "timer.pinned"))
    },
    [setPinnedTimer],
  )

  const renderActions = useCallback(
    (timer: Timer) => <TimerCard key={timer.id} timer={timer} nowMs={nowMs} variant="menu" />,
    [nowMs],
  )

  return (
    <DialDashboard
      timers={props.timers}
      spaces={props.spaces}
      keepOrder={props.sortMode !== "soonest"}
      onTogglePin={togglePin}
      renderActions={renderActions}
      className="mb-4"
    />
  )
}
