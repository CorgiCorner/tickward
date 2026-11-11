import {
  lastMilestoneBefore,
  nextMilestoneAfter,
  upcomingMilestones,
  type MilestoneOccurrence,
  type MilestoneRule,
} from "@/lib/milestones"
import { isMilestoneDay, reachedMilestone } from "@/components/dashboard/milestone-day"
import type { Timer } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"

// The rules behind the dial view: how 60 ticks read a timer, how a count-up fills toward its
// next milestone, and how the list groups timers. Pure functions of a timer and an instant, so
// every view and test reads the same numbers. Mirrors DialScale and MilestoneStretch in the
// iPhone app.

export const DIAL_TICK_COUNT = 60

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

export type DialScaleUnit = "second" | "minute" | "hour" | "day" | "week"

const SCALE_UNITS: ReadonlyArray<readonly [DialScaleUnit, number]> = [
  ["second", SECOND_MS],
  ["minute", MINUTE_MS],
  ["hour", HOUR_MS],
  ["day", DAY_MS],
  ["week", WEEK_MS],
]

export type DialScale = Readonly<{
  unit: DialScaleUnit
  /** Whole ticks that are lit. */
  lit: number
  /** 0...1, how much of the next tick is still lit. */
  leading: number
  /** `lit + leading`, the single number a dial draws. */
  progress: number
}>

/** One tick per the largest unit that keeps the interval at 60 ticks or fewer. */
export function dialScale(intervalMs: number): DialScale {
  const magnitude = Number.isFinite(intervalMs) ? Math.max(0, intervalMs) : 0
  const [unit, length] =
    SCALE_UNITS.find(([, unitLength]) => magnitude / unitLength <= DIAL_TICK_COUNT) ?? SCALE_UNITS.at(-1)!
  const progress = Math.min(DIAL_TICK_COUNT, magnitude / length)
  const lit = Math.floor(progress)
  return { unit, lit, leading: progress - lit, progress }
}

export type DialTickState = "lit" | "leading" | "rest"

export type DialTick = Readonly<{
  index: number
  major: boolean
  state: DialTickState
  /** Opacity of the lit stroke: 1 when lit, 0.18...1 for the leading tick, 0 at rest. */
  share: number
}>

/** The 60 ticks for a progress of 0...60 lit ticks. */
export function dialTicks(progress: number): DialTick[] {
  const clamped = Math.min(DIAL_TICK_COUNT, Math.max(0, Number.isFinite(progress) ? progress : 0))
  return Array.from({ length: DIAL_TICK_COUNT }, (_, index) => {
    const share = Math.min(1, Math.max(0, clamped - index))
    const state: DialTickState = share >= 1 ? "lit" : share > 0 ? "leading" : "rest"
    return {
      index,
      major: index % 5 === 0,
      state,
      share: state === "lit" ? 1 : state === "leading" ? 0.18 + 0.82 * share : 0,
    }
  })
}

export type DialReadout = Readonly<{
  /** The big number: whole days, or whole hours under one day. */
  value: number
  unit: "days" | "hours"
  /** The clock under it: hh:mm:ss next to days, mm:ss next to hours. */
  clock: string
}>

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

export function dialReadout(intervalMs: number): DialReadout {
  const total = Math.max(0, Math.floor((Number.isFinite(intervalMs) ? intervalMs : 0) / SECOND_MS))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60
  if (days > 0) return { value: days, unit: "days", clock: `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}` }
  return { value: hours, unit: "hours", clock: `${pad2(minutes)}:${pad2(seconds)}` }
}

/** A count-up without its own rules celebrates every 100 days, as in the iPhone app. */
export const DEFAULT_DIAL_MILESTONE_RULES: MilestoneRule[] = [{ unit: "days", every: 100 }]


export function dialMilestoneRules(timer: Pick<Timer, "milestones">): MilestoneRule[] {
  const rules = timer.milestones?.rules
  return rules && rules.length > 0 ? rules : DEFAULT_DIAL_MILESTONE_RULES
}

export type DialMilestoneStretch = Readonly<{
  /** The last milestone, or the start before the first one. */
  startMs: number
  endMs: number
  previous: MilestoneOccurrence | null
  next: MilestoneOccurrence
  /** 0...1, how much of the stretch has gone. */
  fraction: number
  /** The 24 hours after a milestone: the dial stays complete. */
  isMilestoneDay: boolean
  /** Lit ticks: 60 on a milestone day, otherwise the share of the stretch gone. */
  progress: number
}>

/** Where a count-up stands between its last milestone and the next one. */
export function milestoneStretch(
  timer: Pick<Timer, "targetDate" | "timezone" | "milestones">,
  nowMs: number,
): DialMilestoneStretch | null {
  const anchorMs = new Date(timer.targetDate).getTime()
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) return null
  const rules = dialMilestoneRules(timer)
  const next = nextMilestoneAfter(timer.targetDate, rules, timer.timezone, nowMs)
  if (!next) return null
  const previous = lastMilestoneBefore(timer.targetDate, rules, timer.timezone, nowMs)
  const startMs = previous ? new Date(previous.at).getTime() : anchorMs
  const endMs = new Date(next.at).getTime()
  const length = endMs - startMs
  const fraction = length > 0 ? Math.min(1, Math.max(0, (nowMs - startMs) / length)) : 1
  const milestoneDay = previous !== null && isMilestoneDay(startMs, nowMs)
  return {
    startMs,
    endMs,
    previous,
    next,
    fraction,
    isMilestoneDay: milestoneDay,
    progress: milestoneDay ? DIAL_TICK_COUNT : fraction * DIAL_TICK_COUNT,
  }
}

/** The milestone reached in the last 24 hours, if any. */
export function milestoneReachedToday(
  timer: Pick<Timer, "targetDate" | "timezone" | "milestones" | "mode">,
  nowMs: number,
): MilestoneOccurrence | null {
  if (timer.mode !== "since") return null
  return reachedMilestone(timer.targetDate, dialMilestoneRules(timer), timer.timezone, nowMs)
}

/**
 * - `countdown`: the date (or the next occurrence, or a count-up's start) is still ahead.
 * - `countUp`: a count-up timer past its start, filling toward its next milestone.
 * - `passed`: a one-off date has passed and the timer counts up from it.
 */
export type DialTimerPhase = "countdown" | "countUp" | "passed"

export type DialTimerView = Readonly<{
  id: string
  phase: DialTimerPhase
  /** The instant the dial reads: the target, the next occurrence or the start. */
  instantMs: number
  /** Time left for a countdown, time gone otherwise. */
  intervalMs: number
  progress: number
  /** The tick unit when the dial reads an interval; null when it reads a milestone stretch. */
  scaleUnit: DialScaleUnit | null
  readout: DialReadout
  stretch: DialMilestoneStretch | null
}>

export function dialTimerView(timer: Timer, nowMs: number): DialTimerView {
  if (timer.mode === "since") {
    const anchorMs = new Date(timer.targetDate).getTime()
    if (Number.isFinite(anchorMs) && anchorMs <= nowMs) {
      const intervalMs = nowMs - anchorMs
      const stretch = milestoneStretch(timer, nowMs)
      const scale = dialScale(intervalMs)
      return {
        id: timer.id,
        phase: "countUp",
        instantMs: anchorMs,
        intervalMs,
        progress: stretch ? stretch.progress : scale.progress,
        scaleUnit: stretch ? null : scale.unit,
        readout: dialReadout(intervalMs),
        stretch,
      }
    }
  }

  // A count-up whose start is still ahead counts down to the start, not to its first milestone.
  const instantMs = new Date(timer.mode === "since" ? timer.targetDate : effectiveTargetDate(timer, nowMs)).getTime()
  const safeInstant = Number.isFinite(instantMs) ? instantMs : nowMs
  const passed = safeInstant <= nowMs && timer.mode !== "since"
  const intervalMs = Math.abs(safeInstant - nowMs)
  const scale = dialScale(intervalMs)
  return {
    id: timer.id,
    phase: passed ? "passed" : "countdown",
    instantMs: safeInstant,
    intervalMs,
    progress: scale.progress,
    scaleUnit: scale.unit,
    readout: dialReadout(intervalMs),
    stretch: null,
  }
}

export type DialSectionId = "pinned" | "thisWeek" | "later" | "countingUp"

export const DIAL_SECTION_ORDER: readonly DialSectionId[] = ["pinned", "thisWeek", "later", "countingUp"]

export type DialSection = Readonly<{ id: DialSectionId; timers: Timer[] }>

const THIS_WEEK_MS = 7 * DAY_MS

type Placed = { timer: Timer; view: DialTimerView }

function byInstantAscending(a: Placed, b: Placed) {
  if (a.view.instantMs === b.view.instantMs) return a.timer.id < b.timer.id ? -1 : 1
  return a.view.instantMs - b.view.instantMs
}

function byRecentStart(a: Placed, b: Placed) {
  if (a.view.instantMs === b.view.instantMs) return a.timer.id < b.timer.id ? -1 : 1
  return b.view.instantMs - a.view.instantMs
}

/**
 * The list sections of the iPhone app: pinned timers first, then countdowns due within seven
 * days, later countdowns, and everything counting up (count-ups and passed dates). Archived
 * timers are left out. Empty sections are dropped.
 *
 * With `keepOrder` each section keeps the order the timers arrive in (the dashboard's own sort,
 * such as Manual order or by name) instead of sorting by date.
 */
export function dialSections(
  timers: ReadonlyArray<Timer>,
  nowMs: number,
  options: Readonly<{ keepOrder?: boolean }> = {},
): DialSection[] {
  const placed = timers
    .filter((timer) => !timer.archivedAt)
    .map((timer) => ({ timer, view: dialTimerView(timer, nowMs) }))
  const groups: Record<DialSectionId, Placed[]> = { pinned: [], thisWeek: [], later: [], countingUp: [] }
  for (const entry of placed) {
    if (entry.timer.pinned) groups.pinned.push(entry)
    else if (entry.view.phase !== "countdown") groups.countingUp.push(entry)
    else if (entry.view.instantMs - nowMs < THIS_WEEK_MS) groups.thisWeek.push(entry)
    else groups.later.push(entry)
  }
  const countdownsFirst = (a: Placed, b: Placed) => {
    const aUp = a.view.phase !== "countdown"
    const bUp = b.view.phase !== "countdown"
    if (aUp !== bUp) return aUp ? 1 : -1
    return aUp ? byRecentStart(a, b) : byInstantAscending(a, b)
  }
  if (!options.keepOrder) {
    groups.pinned.sort(countdownsFirst)
    groups.thisWeek.sort(byInstantAscending)
    groups.later.sort(byInstantAscending)
    groups.countingUp.sort(byRecentStart)
  }
  return DIAL_SECTION_ORDER.map((id) => ({ id, timers: groups[id].map((entry) => entry.timer) })).filter(
    (section) => section.timers.length > 0,
  )
}

/** The first pinned timer, else the nearest countdown, else the first timer in the list. */
export function defaultDialSelection(
  timers: ReadonlyArray<Timer>,
  nowMs: number,
  options: Readonly<{ keepOrder?: boolean }> = {},
): string | null {
  const sections = dialSections(timers, nowMs, options)
  const pinned = sections.find((section) => section.id === "pinned")
  if (pinned) return pinned.timers[0].id
  const nearest = sections.find((section) => section.id === "thisWeek" || section.id === "later")
  if (nearest) return nearest.timers[0].id
  return sections[0]?.timers[0]?.id ?? null
}

export type DialTrailState = "reached" | "next" | "later"

export type DialTrailItem = Readonly<{
  key: string
  milestone: MilestoneOccurrence
  atMs: number
  state: DialTrailState
  /** Reached within the last 24 hours. */
  today: boolean
}>

/** Up to two reached milestones, the next one and up to two after it, four badges at most. */
export function milestoneTrail(
  timer: Timer,
  nowMs: number,
  options: Readonly<{ reached?: number; later?: number; total?: number }> = {},
): DialTrailItem[] {
  if (timer.mode !== "since") return []
  const anchorMs = new Date(timer.targetDate).getTime()
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) return []
  const rules = dialMilestoneRules(timer)
  const reachedLimit = options.reached ?? 2
  const laterLimit = options.later ?? 2

  const reached: MilestoneOccurrence[] = []
  let cursor = nowMs
  while (reached.length < reachedLimit) {
    const previous = lastMilestoneBefore(timer.targetDate, rules, timer.timezone, cursor)
    if (!previous) break
    reached.unshift(previous)
    cursor = new Date(previous.at).getTime() - 1
  }

  const room = Math.max(1, (options.total ?? 4) - reached.length - 1)
  const upcoming = upcomingMilestones(timer.targetDate, rules, timer.timezone, nowMs, 1 + Math.min(laterLimit, room))
  const item = (milestone: MilestoneOccurrence, state: DialTrailState): DialTrailItem => {
    const atMs = new Date(milestone.at).getTime()
    return {
      key: `${milestone.unit}:${milestone.count}:${milestone.at}`,
      milestone,
      atMs,
      state,
      today: state === "reached" && isMilestoneDay(atMs, nowMs),
    }
  }
  return [
    ...reached.map((milestone) => item(milestone, "reached")),
    ...upcoming.map((milestone, index) => item(milestone, index === 0 ? "next" : "later")),
  ]
}
