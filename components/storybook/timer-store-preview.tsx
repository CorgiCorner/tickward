"use client"

import type { PropsWithChildren } from "react"

import { TimerStoreProvider } from "@/lib/store"
import { DEFAULT_TIMER_SORT_MODE } from "@/lib/stores/timer-store-domain"
import type { Space, Timer, TimerFilters } from "@/lib/types"

export const storybookNowMs = Date.parse("2026-06-03T08:00:00.000Z")

export const storybookSpaces: Space[] = [
  {
    id: "space-work",
    name: "Work",
    color: "#2563eb",
    createdAt: "2026-06-03T08:00:00.000Z",
  },
  {
    id: "space-home",
    name: "Home",
    color: "#16a34a",
    createdAt: "2026-06-03T08:00:00.000Z",
  },
]

export const storybookTimers: Timer[] = [
  {
    id: "timer-launch",
    label: "Public launch",
    targetDate: "2026-06-10T12:00:00.000Z",
    timezone: "UTC",
    createdAt: "2026-06-03T08:00:00.000Z",
    updatedAt: "2026-06-03T08:00:00.000Z",
    description: "Release the public open-core snapshot.",
    spaceId: "space-work",
    pinned: true,
  },
]

type TimerStorePreviewProps = PropsWithChildren<{
  timers?: Timer[]
  spaces?: Space[]
  activeSpaceId?: string | null
  timerFilters?: TimerFilters
}>

export function TimerStorePreview(props: TimerStorePreviewProps) {
  return (
    <TimerStoreProvider
      initialState={{
        timers: props.timers ?? storybookTimers,
        spaces: props.spaces ?? storybookSpaces,
        activeSpaceId: props.activeSpaceId ?? "space-work",
        sortMode: DEFAULT_TIMER_SORT_MODE,
        timerFilters: props.timerFilters ?? {
          type: "all",
          pinned: false,
          muted: false,
          shared: false,
          recurring: false,
        },
        restoreKey: "storybook_restore_key",
      }}
    >
      {props.children}
    </TimerStoreProvider>
  )
}
