"use client"

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CornerDownLeftIcon,
  KeyIcon,
  PinIcon,
  TimerIcon,
  XIcon,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { FooterStatusBar } from "@/components/footer"
import { CountUpIntroNote } from "@/components/count-up-intro-note"
import {
  COUNT_UP_HIGHLIGHT_DURATION_MS,
  COUNT_UP_VIEW_EVENT,
  findCountUpCard,
  isCountUpCardInViewport,
  navigateToCountUpCard,
  takePendingCountUpTarget,
  type CountUpNavigationTarget,
} from "@/components/count-up-navigation"
import { IosPwaPrompt } from "@/components/ios-pwa-prompt"
import { Header } from "@/components/header"
import { HOME_EMPTY_TIMER_EXAMPLES, HomeMainLoadingSkeleton } from "@/components/app-shell-loading"
import { OrganizerBar } from "@/components/organizer-bar"
import { aggregateCountUpAnalyticsPolicy, trackCountUpAnalyticsEvent } from "@/components/plausible-analytics"
import { ProjectClaimToast } from "@/components/project-claim-slot"
import { QuickAddTimer } from "@/components/quick-add-timer"
import { TimerAlarmOverlay } from "@/components/timer-alarm-overlay"
import { TimerCard } from "@/components/timer-card"
import { Button } from "@/components/ui/button"
import { useNow } from "@/components/use-now"
import { useLocalTimerAlarms } from "@/components/use-local-timer-alarms"
import { useBatchedCountUpSeen } from "@/components/use-count-up-seen"
import { useProjectUrlSync } from "@/hooks/use-project-url-sync"
import { authClient } from "@/lib/auth/auth-client"
import { runInBackground } from "@/lib/background-task"
import { browserTitle } from "@/lib/browser-title"
import { logClientError } from "@/lib/client-errors"
import { getEntitlements, setActiveClientPlan } from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { getCountUpOccurrenceKey, type CountUpOccurrence } from "@/lib/stores/count-up-store"
import { timerMatchesFilters } from "@/lib/timer-filters"
import type { Timer, TimerSortMode } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { cn, effectiveTargetDate } from "@/lib/utils"

function DismissButton(props: Readonly<{ onClick: () => void }>) {
  return (
    <button
      type="button"
      aria-label={formatMessage("common.dismiss")}
      className="mt-0.5 shrink-0 self-start text-muted-foreground hover:text-foreground"
      onClick={props.onClick}
    >
      <XIcon className="size-4" />
    </button>
  )
}

function OnboardingBanner(props: Readonly<{ timerCount: number; spaceCount: number }>) {
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const [dismissed, setDismissed] = useState(() => {
    if (globalThis.window === undefined) return true
    return Boolean(localStorage.getItem("hasSeenOnboarding"))
  })

  if (dismissed || restoreKey || (props.timerCount === 0 && props.spaceCount === 0)) return null

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border bg-card p-4">
      <KeyIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{formatMessage("home.onboarding.title")}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{formatMessage("home.onboarding.description")}</div>
      </div>
      <DismissButton
        onClick={() => {
          setDismissed(true)
          localStorage.setItem("hasSeenOnboarding", "1")
        }}
      />
    </div>
  )
}

function EmptyState(
  props: Readonly<{
    compact?: boolean
    onSelectExample: (label: string) => void
  }>,
) {
  return (
    <div
      className={[
        props.compact ? "mt-6" : "mt-0",
        "rounded-[16px] border border-dashed border-border bg-card px-6 py-16 text-center",
      ].join(" ")}
    >
      <div className="mx-auto grid size-12 place-items-center rounded-full border border-border text-muted-foreground">
        <TimerIcon className="size-[22px]" />
      </div>
      <div className="mt-4 text-base font-semibold tracking-normal">{formatMessage("home.empty.title")}</div>
      <p className="mx-auto mt-1.5 max-w-[20rem] text-sm leading-6 text-muted-foreground">
        {formatMessage("home.empty.description")} {formatMessage("home.empty.getStartedBeforeKey")}{" "}
        <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border px-1 text-muted-foreground">
          <CornerDownLeftIcon className="size-3" strokeWidth={2.5} />
        </kbd>{" "}
        {formatMessage("home.empty.getStartedAfterKey")}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        {HOME_EMPTY_TIMER_EXAMPLES.map((messageKey) => {
          const label = formatMessage(messageKey)
          return (
            <button
              key={messageKey}
              type="button"
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              onClick={() => props.onSelectExample(label)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FilteredEmptyState() {
  return (
    <div className="mt-6 rounded-[16px] border border-dashed border-border bg-card p-8 text-center">
      <TimerIcon className="mx-auto size-8 text-muted-foreground" />
      <div className="mt-3 text-sm font-medium">{formatMessage("home.filteredEmpty.title")}</div>
      <div className="mt-1 text-xs text-muted-foreground">{formatMessage("home.filteredEmpty.description")}</div>
    </div>
  )
}

function ProjectConflictBanner() {
  const conflict = useTimerStore((s) => s.projectConflict)
  const useCloudProjectVersion = useTimerStore((s) => s.useCloudProjectVersion)
  const overwriteCloudProjectVersion = useTimerStore((s) => s.overwriteCloudProjectVersion)

  if (!conflict) return null

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{formatMessage("home.conflict.title")}</div>
          <div className="mt-1 text-xs opacity-80">{formatMessage("home.conflict.description")}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={useCloudProjectVersion}>
              {formatMessage("home.conflict.useCloud")}
            </Button>
            <Button
              size="sm"
              onClick={() => runInBackground("home.overwriteCloudProjectVersion", overwriteCloudProjectVersion())}
            >
              {formatMessage("home.conflict.overwriteCloud")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectReadOnlyBanner() {
  const readOnly = useTimerStore((s) => s.isActiveProjectReadOnly)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const projects = useTimerStore((s) => s.projects)

  if (!readOnly) return null

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const purgeAt = activeProject?.overLimitPurgeAt ?? null
  const { maxProjects } = getEntitlements()

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{formatMessage("project.readOnly.banner.title")}</div>
          <div className="mt-1 text-xs opacity-80">
            {formatMessage("project.readOnly.banner.description", {
              max: String(maxProjects),
            })}
          </div>
          {purgeAt ? (
            <div className="mt-1 text-xs opacity-80">
              {formatMessage("project.readOnly.banner.purgeScheduled", {
                date: new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                }).format(new Date(purgeAt)),
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CountUpStickyBanner(props: Readonly<{ count: number; onView: () => void }>) {
  if (props.count === 0) return null

  return (
    <div
      data-slot="count-up-sticky-banner"
      className="sticky top-[4.25rem] z-30 mb-4 flex items-center gap-2 rounded-2xl border border-primary/20 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <TimerIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        {formatMessage(props.count === 1 ? "countUp.sticky.single" : "countUp.sticky.multiple", {
          count: props.count,
        })}
      </p>
      <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" onClick={props.onView}>
        {formatMessage("countUp.view")}
      </Button>
    </div>
  )
}

function targetMs(timer: Timer, nowMs: number) {
  return new Date(effectiveTargetDate(timer, nowMs)).getTime()
}

function timerReclassificationBoundaryMs(timer: Timer, nowMs: number) {
  if (timer.mode === "since") return null
  const target = targetMs(timer, nowMs)
  if (!Number.isFinite(target)) return null
  if (timer.recurrence?.enabled) return target >= nowMs ? target : null
  return target >= nowMs ? target + 1 : null
}

function nextReclassificationBoundaryMs(timers: Timer[], nowMs: number) {
  let next: number | null = null

  for (const timer of timers) {
    const boundary = timerReclassificationBoundaryMs(timer, nowMs)
    if (boundary === null || boundary <= nowMs) continue
    if (next === null || boundary < next) next = boundary
  }

  return next
}

function sortTimers(timers: Timer[], sortMode: TimerSortMode, nowMs: number) {
  if (sortMode === "manual") return timers

  const sorted = [...timers]
  sorted.sort((a, b) => {
    if (sortMode === "soonest") {
      const aTarget = targetMs(a, nowMs)
      const bTarget = targetMs(b, nowMs)
      const aFuture = aTarget >= nowMs
      const bFuture = bTarget >= nowMs
      if (aFuture !== bFuture) return aFuture ? -1 : 1
      return aFuture ? aTarget - bTarget : bTarget - aTarget
    }

    if (sortMode === "latest") {
      return targetMs(b, nowMs) - targetMs(a, nowMs)
    }

    if (sortMode === "name_asc") {
      const byName = a.label.localeCompare(b.label, undefined, {
        sensitivity: "base",
      })
      if (byName !== 0) return byName
      return targetMs(a, nowMs) - targetMs(b, nowMs)
    }

    if (sortMode === "recently_added") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }

    return 0
  })
  return sorted
}

function matchesActiveSpace(timer: Timer, activeSpaceId: string | null, spaces: { id: string }[]) {
  if (activeSpaceId === null) return true
  if (activeSpaceId === UNASSIGNED_SPACE_ID) {
    return !timer.spaceId || !spaces.some((space) => space.id === timer.spaceId)
  }
  return timer.spaceId === activeSpaceId
}

type TimerSectionKind = "pinned" | "countUp" | "upcoming" | "past" | "archived"
const COUNT_UP_CROSS_HOLD_MS = 1_500
const COUNT_UP_CROSSFADE_MS = 300

const SortableTimerSection = memo(function SortableTimerSection(
  props: Readonly<{
    kind: TimerSectionKind
    headingId: string
    title: string
    timers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => void
    icon?: ReactNode
    id?: string
    dataSlot?: string
    className?: string
    listClassName?: string
    action?: ReactNode
    count?: number
    sortable?: boolean
    countUpOccurrences?: ReadonlyMap<string, CountUpOccurrence>
    countUpPlacement?: "section" | "pinned"
    heldCountUpTimerIds?: ReadonlySet<string>
    reducedMotionCountUpTimerIds?: ReadonlySet<string>
    onCountUpInteractionChange?: (timerId: string, active: boolean) => void
    onCountUpSeen?: (key: string) => void
  }>,
) {
  if (props.timers.length === 0) return null

  const list = (
    <div data-slot={props.dataSlot} className={cn("grid gap-3", props.listClassName)}>
      {props.timers.map((timer) => (
        <TimerCard
          key={timer.id}
          timer={timer}
          nowMs={props.nowMs}
          sortable={props.sortable}
          countUpOccurrence={props.countUpOccurrences?.get(timer.id)}
          countUpPlacement={props.countUpOccurrences?.has(timer.id) ? props.countUpPlacement : undefined}
          countUpHolding={props.heldCountUpTimerIds?.has(timer.id)}
          countUpCrossfade={
            props.reducedMotionCountUpTimerIds?.has(timer.id) && !props.heldCountUpTimerIds?.has(timer.id)
          }
          onCountUpInteractionChange={(active) => props.onCountUpInteractionChange?.(timer.id, active)}
          onCountUpSeen={props.onCountUpSeen}
        />
      ))}
    </div>
  )

  return (
    <section id={props.id} aria-labelledby={props.headingId} className={props.className}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div
          id={props.headingId}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        >
          {props.icon}
          <span>{props.title}</span>
          {props.count === undefined ? null : (
            <span data-slot="timer-section-count" className="tabular-nums">
              {props.count}
            </span>
          )}
        </div>
        {props.action}
      </div>
      {props.sortable === false ? (
        list
      ) : (
        <DndContext
          sensors={props.sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => props.onDragEnd(event, props.timers, props.kind)}
        >
          <SortableContext items={props.timers.map((timer) => timer.id)} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
})

const CountUpTimerSection = memo(function CountUpTimerSection(
  props: Readonly<{
    timers: Timer[]
    occurrencesByTimer: ReadonlyMap<string, CountUpOccurrence>
    nowMs: number
    onAcknowledge: (keys: string[]) => void
    onUnacknowledge: (keys: string[]) => void
    reducedMotionCountUpTimerIds: ReadonlySet<string>
    onInteractionChange: (timerId: string, active: boolean) => void
    onCountUpSeen: (key: string) => void
    revealCountUpKey?: string
  }>,
) {
  const [expanded, setExpanded] = useState(false)
  const count = props.timers.length
  if (count === 0) return null

  const canExpand = count >= 4 && count <= 10
  const revealTimer = props.revealCountUpKey
    ? props.timers.find((timer) => props.occurrencesByTimer.get(timer.id)?.key === props.revealCountUpKey)
    : undefined
  const orderedForDisplay =
    revealTimer && !props.timers.slice(0, 3).includes(revealTimer)
      ? [revealTimer, ...props.timers.filter((timer) => timer.id !== revealTimer.id)]
      : props.timers
  const visibleTimers = canExpand && expanded ? props.timers : orderedForDisplay.slice(0, 3)
  const hiddenCount = count - visibleTimers.length
  const keys = props.timers.flatMap((timer) => {
    const occurrence = props.occurrencesByTimer.get(timer.id)
    return occurrence ? [occurrence.key] : []
  })

  function acknowledgeAll() {
    const policy = aggregateCountUpAnalyticsPolicy(
      props.timers.map((timer) => props.occurrencesByTimer.get(timer.id)?.policy?.mode),
    )
    props.onAcknowledge(keys)
    trackCountUpAnalyticsEvent("transition_bulk_action", { policy, sectionSize: 0 })
    toast(formatMessage("countUp.bulkMoved", { count }), {
      action: {
        label: formatMessage("common.undo"),
        onClick: () => {
          props.onUnacknowledge(keys)
          trackCountUpAnalyticsEvent("transition_undo", { policy, sectionSize: count })
        },
      },
    })
  }

  return (
    <section id="count-up-timers" aria-labelledby="count-up-timers-heading" className="scroll-mt-20">
      <div className="mb-2 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div
            id="count-up-timers-heading"
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            <TimerIcon className="size-3" />
            {formatMessage("home.countUp")} · {formatMessage("countUp.sectionCount", { count })}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatMessage("home.startedCountingUp.helper")}</p>
        </div>
        {count > 1 ? (
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            onClick={acknowledgeAll}
          >
            {formatMessage("countUp.acknowledgeAll")}
          </button>
        ) : null}
      </div>
      <CountUpIntroNote />
      <div data-slot="count-up-timer-list" className="grid gap-3">
        {visibleTimers.map((timer) => (
          <TimerCard
            key={timer.id}
            timer={timer}
            nowMs={props.nowMs}
            sortable={false}
            countUpOccurrence={props.occurrencesByTimer.get(timer.id)}
            countUpPlacement="section"
            countUpCrossfade={props.reducedMotionCountUpTimerIds.has(timer.id)}
            onCountUpInteractionChange={(active) => props.onInteractionChange(timer.id, active)}
            onCountUpSeen={props.onCountUpSeen}
          />
        ))}
      </div>
      {canExpand && hiddenCount > 0 ? (
        <button
          type="button"
          className="mt-2 w-full rounded-xl border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          onClick={() => setExpanded(true)}
        >
          {formatMessage("countUp.showMore", { count: hiddenCount })}
        </button>
      ) : null}
      {canExpand && expanded ? (
        <button
          type="button"
          className="mt-2 w-full text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          onClick={() => setExpanded(false)}
        >
          {formatMessage("countUp.collapse")}
        </button>
      ) : null}
      {count > 10 ? (
        <p className="mt-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {formatMessage("countUp.summary", { count: count - 3 })}
        </p>
      ) : null}
    </section>
  )
})

const ActiveTimerList = memo(function ActiveTimerList(
  props: Readonly<{
    pinnedTimers: Timer[]
    countUpTimers: Timer[]
    countUpOccurrencesByTimer: ReadonlyMap<string, CountUpOccurrence>
    upcomingTimers: Timer[]
    pastTimers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => void
    onAcknowledgeCountUps: (keys: string[]) => void
    onUnacknowledgeCountUps: (keys: string[]) => void
    heldCountUpTimerIds: ReadonlySet<string>
    reducedMotionCountUpTimerIds: ReadonlySet<string>
    onCountUpInteractionChange: (timerId: string, active: boolean) => void
    onCountUpSeen: (key: string) => void
    revealCountUpKey?: string
  }>,
) {
  if (
    props.pinnedTimers.length === 0 &&
    props.countUpTimers.length === 0 &&
    props.upcomingTimers.length === 0 &&
    props.pastTimers.length === 0
  )
    return null

  return (
    <div id="active-timers" data-slot="timer-list" className="grid gap-6 scroll-mt-20">
      <SortableTimerSection
        kind="pinned"
        headingId="pinned-timers-heading"
        title={formatMessage("timer.pinned.label")}
        timers={props.pinnedTimers}
        nowMs={props.nowMs}
        sensors={props.sensors}
        onDragEnd={props.onDragEnd}
        icon={<PinIcon className="size-3" />}
        countUpOccurrences={props.countUpOccurrencesByTimer}
        countUpPlacement="pinned"
        heldCountUpTimerIds={props.heldCountUpTimerIds}
        reducedMotionCountUpTimerIds={props.reducedMotionCountUpTimerIds}
        onCountUpInteractionChange={props.onCountUpInteractionChange}
        onCountUpSeen={props.onCountUpSeen}
      />
      <CountUpTimerSection
        timers={props.countUpTimers}
        occurrencesByTimer={props.countUpOccurrencesByTimer}
        nowMs={props.nowMs}
        onAcknowledge={props.onAcknowledgeCountUps}
        onUnacknowledge={props.onUnacknowledgeCountUps}
        reducedMotionCountUpTimerIds={props.reducedMotionCountUpTimerIds}
        onInteractionChange={props.onCountUpInteractionChange}
        onCountUpSeen={props.onCountUpSeen}
        revealCountUpKey={props.revealCountUpKey}
      />
      <SortableTimerSection
        kind="upcoming"
        headingId="upcoming-timers-heading"
        title={formatMessage("home.upcoming")}
        timers={props.upcomingTimers}
        nowMs={props.nowMs}
        sensors={props.sensors}
        onDragEnd={props.onDragEnd}
        countUpOccurrences={props.countUpOccurrencesByTimer}
        countUpPlacement="section"
        heldCountUpTimerIds={props.heldCountUpTimerIds}
        reducedMotionCountUpTimerIds={props.reducedMotionCountUpTimerIds}
        onCountUpInteractionChange={props.onCountUpInteractionChange}
        onCountUpSeen={props.onCountUpSeen}
      />
      <SortableTimerSection
        kind="past"
        headingId="past-timers-heading"
        title={formatMessage("home.past")}
        timers={props.pastTimers}
        count={props.pastTimers.length}
        nowMs={props.nowMs}
        sensors={props.sensors}
        onDragEnd={props.onDragEnd}
        sortable={false}
        onCountUpInteractionChange={props.onCountUpInteractionChange}
      />
    </div>
  )
})

function scrollToId(id: string) {
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  document.getElementById(id)?.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  })
}

function countUpPrefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

type CountUpTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown
}

function runCountUpMove(update: () => void, reduceMotion: boolean) {
  const startViewTransition = (document as CountUpTransitionDocument).startViewTransition
  if (reduceMotion || !startViewTransition) {
    update()
    return
  }
  startViewTransition.call(document, update)
}

// Jump control between the active list and the archived list, shown only when
// both are present so reaching the archive (or getting back) is a single tap.
function SectionJump(props: Readonly<{ direction: "toArchived" | "toActive" }>) {
  const toArchived = props.direction === "toArchived"
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      onClick={() => scrollToId(toArchived ? "archived-timers" : "active-timers")}
    >
      {toArchived ? <ArrowDownIcon className="size-3.5" /> : <ArrowUpIcon className="size-3.5" />}
      {formatMessage(toArchived ? "home.archived.showAll" : "home.jumpToActive")}
    </button>
  )
}

const ArchivedTimerList = memo(function ArchivedTimerList(
  props: Readonly<{
    timers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => void
    showJumpToActive: boolean
  }>,
) {
  if (props.timers.length === 0) return null

  return (
    <>
      <SortableTimerSection
        kind="archived"
        id="archived-timers"
        className="mt-6 scroll-mt-20"
        headingId="archived-timers-heading"
        title={formatMessage("home.archived")}
        timers={props.timers}
        nowMs={props.nowMs}
        sensors={props.sensors}
        onDragEnd={props.onDragEnd}
        dataSlot="archived-timer-list"
        listClassName="opacity-70"
        action={
          <button
            type="button"
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => scrollToId("archived-timers")}
          >
            {formatMessage("home.archived.showAll")}
          </button>
        }
      />
      {props.showJumpToActive ? (
        <div className="mt-3 flex justify-end">
          <SectionJump direction="toActive" />
        </div>
      ) : null}
    </>
  )
})

const TimerCollection = memo(function TimerCollection(
  props: Readonly<{
    hasActiveProject: boolean
    timers: Timer[]
    activeTimers: Timer[]
    archivedTimers: Timer[]
    pinnedTimers: Timer[]
    countUpTimers: Timer[]
    countUpOccurrencesByTimer: ReadonlyMap<string, CountUpOccurrence>
    upcomingTimers: Timer[]
    pastTimers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => void
    onSelectExample: (label: string) => void
    onAcknowledgeCountUps: (keys: string[]) => void
    onUnacknowledgeCountUps: (keys: string[]) => void
    heldCountUpTimerIds: ReadonlySet<string>
    reducedMotionCountUpTimerIds: ReadonlySet<string>
    onCountUpInteractionChange: (timerId: string, active: boolean) => void
    onCountUpSeen: (key: string) => void
    revealCountUpKey?: string
  }>,
) {
  if (props.timers.length === 0) {
    return (
      <>
        {props.hasActiveProject ? <OrganizerBar nowMs={props.nowMs} /> : null}
        <EmptyState compact={!props.hasActiveProject} onSelectExample={props.onSelectExample} />
      </>
    )
  }

  const showSectionJump = props.activeTimers.length > 0 && props.archivedTimers.length > 0

  return (
    <>
      <OrganizerBar nowMs={props.nowMs} />
      {props.activeTimers.length > 0 ? (
        <ActiveTimerList
          pinnedTimers={props.pinnedTimers}
          countUpTimers={props.countUpTimers}
          countUpOccurrencesByTimer={props.countUpOccurrencesByTimer}
          upcomingTimers={props.upcomingTimers}
          pastTimers={props.pastTimers}
          nowMs={props.nowMs}
          sensors={props.sensors}
          onDragEnd={props.onDragEnd}
          onAcknowledgeCountUps={props.onAcknowledgeCountUps}
          onUnacknowledgeCountUps={props.onUnacknowledgeCountUps}
          heldCountUpTimerIds={props.heldCountUpTimerIds}
          reducedMotionCountUpTimerIds={props.reducedMotionCountUpTimerIds}
          onCountUpInteractionChange={props.onCountUpInteractionChange}
          onCountUpSeen={props.onCountUpSeen}
          revealCountUpKey={props.revealCountUpKey}
        />
      ) : null}
      {showSectionJump ? (
        <div className="mt-3 flex justify-end px-1">
          <SectionJump direction="toArchived" />
        </div>
      ) : null}
      <ArchivedTimerList
        timers={props.archivedTimers}
        nowMs={props.nowMs}
        sensors={props.sensors}
        onDragEnd={props.onDragEnd}
        showJumpToActive={props.activeTimers.length > 0}
      />
      {props.activeTimers.length === 0 && props.archivedTimers.length === 0 ? <FilteredEmptyState /> : null}
    </>
  )
})

function ReclassificationBoundary(
  props: Readonly<{
    nextBoundaryMs: number
    onBoundary: (nowMs: number) => void
  }>,
) {
  const nowMs = useNow()
  const { nextBoundaryMs, onBoundary } = props

  useEffect(() => {
    if (nowMs >= nextBoundaryMs) onBoundary(nowMs)
  }, [nextBoundaryMs, nowMs, onBoundary])

  return null
}

function HomeTickEffects(
  props: Readonly<{
    activeProjectId?: string
    activeProjectName?: string
    hasHydrated: boolean
    timers: Timer[]
  }>,
) {
  const nowMs = useNow()
  const alarmTimers = props.hasHydrated ? props.timers : []
  const localAlarm = useLocalTimerAlarms(alarmTimers, nowMs, {
    projectId: props.activeProjectId ?? "local",
    projectName: props.activeProjectName ?? formatMessage("project.defaultName"),
  })
  const markCountUpSeenForProject = useTimerStore((state) => state.markCountUpSeenForProject)

  useEffect(() => {
    if (!props.hasHydrated) return
    document.title = browserTitle({
      projectName: props.activeProjectName,
      timers: props.timers,
      nowMs,
    })
  }, [props.activeProjectName, props.hasHydrated, nowMs, props.timers])

  const dismissAlarm = () => {
    if (localAlarm.alarm?.countUpOccurrence) {
      const targetAtMs = new Date(localAlarm.alarm.boundary).getTime()
      if (Number.isFinite(targetAtMs)) {
        markCountUpSeenForProject(localAlarm.alarm.projectId, [
          getCountUpOccurrenceKey(localAlarm.alarm.timerId, targetAtMs),
        ])
      }
    }
    localAlarm.dismissAlarm()
  }

  const viewAlarm = () => {
    const alarm = localAlarm.alarm
    if (!alarm) return
    dismissAlarm()
    globalThis.dispatchEvent(
      new CustomEvent(COUNT_UP_VIEW_EVENT, {
        detail: {
          projectId: alarm.projectId,
          timerId: alarm.timerId,
          targetAtMs: new Date(alarm.boundary).getTime(),
        },
      }),
    )
  }

  return <TimerAlarmOverlay alarm={localAlarm.alarm} onDismiss={dismissAlarm} onView={viewAlarm} />
}

function isPastTimer(timer: Timer, nowMs: number) {
  return timer.recurrence?.enabled !== true && targetMs(timer, nowMs) < nowMs
}

export function HomeClient() {
  useProjectUrlSync()
  const hasHydrated = useTimerStore((s) => s.hasHydrated)
  const refreshAccountProjectsFromCloud = useTimerStore((s) => s.refreshAccountProjectsFromCloud)
  const maybeAutoClaimActiveProject = useTimerStore((s) => s.maybeAutoClaimActiveProject)
  const removeAccountProjectsFromDevice = useTimerStore((s) => s.removeAccountProjectsFromDevice)
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const timers = useTimerStore((s) => s.timers)
  const spaces = useTimerStore((s) => s.spaces)
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId)
  const sortMode = useTimerStore((s) => s.sortMode)
  const timerFilters = useTimerStore((s) => s.timerFilters)
  const refreshFollowedTimers = useTimerStore((s) => s.refreshFollowedTimers)
  const refreshActiveProjectFromCloud = useTimerStore((s) => s.refreshActiveProjectFromCloud)
  const reorderVisibleTimers = useTimerStore((s) => s.reorderVisibleTimers)
  const reorderTimers = useTimerStore((s) => s.reorderTimers)
  const setTimerSortMode = useTimerStore((s) => s.setTimerSortMode)
  const setActiveSpace = useTimerStore((s) => s.setActiveSpace)
  const clearTimerFilters = useTimerStore((s) => s.clearTimerFilters)
  const countUpOccurrences = useTimerStore((s) => s.countUpOccurrences)
  const detectTimerZeroCross = useTimerStore((s) => s.detectTimerZeroCross)
  const acknowledgeCountUps = useTimerStore((s) => s.acknowledgeCountUps)
  const markCountUpSeen = useTimerStore((s) => s.markCountUpSeen)
  const unacknowledgeCountUps = useTimerStore((s) => s.unacknowledgeCountUps)
  const syncCountUpOccurrences = useTimerStore((s) => s.syncCountUpOccurrences)
  const openCountUpProject = useTimerStore((s) => s.openCountUpProject)
  const queueCountUpSeen = useBatchedCountUpSeen(markCountUpSeen)
  const prepareCountUpTarget = useCallback(() => {
    setActiveSpace(null)
    clearTimerFilters()
  }, [clearTimerFilters, setActiveSpace])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const activeCountUpProjectId = activeProject?.cloudProjectId ?? activeProjectId
  const session = authClient.useSession()
  const signedInUserKey = session.data?.user?.id ?? session.data?.user?.email ?? null
  const sessionPending = Boolean(session.isPending)
  const [quickAddLabel, setQuickAddLabel] = useState("")
  const [classificationNowMs, setClassificationNowMs] = useState(() => Date.now())
  const [heldCountUpTimerIds, setHeldCountUpTimerIds] = useState<ReadonlySet<string>>(() => new Set())
  const [reducedMotionCountUpTimerIds, setReducedMotionCountUpTimerIds] = useState<ReadonlySet<string>>(() => new Set())
  const [countUpAnnouncement, setCountUpAnnouncement] = useState("")
  const [countUpRevealKey, setCountUpRevealKey] = useState<string | undefined>()
  const [offscreenCountUpTargets, setOffscreenCountUpTargets] = useState<
    ReadonlyArray<CountUpNavigationTarget & { key: string; localProjectId: string }>
  >([])
  const countUpInteractionIdsRef = useRef(new Set<string>())
  const countUpReadyToMoveIdsRef = useRef(new Set<string>())
  const countUpHoldTimeoutsRef = useRef(new Map<string, ReturnType<typeof globalThis.setTimeout>>())
  const countUpCrossfadeTimeoutsRef = useRef(new Map<string, ReturnType<typeof globalThis.setTimeout>>())
  const countUpReducedMotionIdsRef = useRef(new Set<string>())
  const countUpLabelsRef = useRef(new Map<string, string>())
  const visibleSpaceTimers = useMemo(
    () => timers.filter((timer) => matchesActiveSpace(timer, activeSpaceId, spaces)),
    [activeSpaceId, spaces, timers],
  )
  const activeProjectTimers = useMemo(() => timers.filter((timer) => !timer.archivedAt), [timers])
  const filteredTimers = useMemo(
    () => visibleSpaceTimers.filter((timer) => timerMatchesFilters(timer, timerFilters, classificationNowMs)),
    [classificationNowMs, timerFilters, visibleSpaceTimers],
  )
  const activeTimers = useMemo(() => filteredTimers.filter((timer) => !timer.archivedAt), [filteredTimers])
  const countUpOccurrencesByTimer = useMemo(() => {
    const timersById = new Map(activeTimers.map((timer) => [timer.id, timer]))
    const activeOccurrences = new Map<string, CountUpOccurrence>()
    for (const occurrence of countUpOccurrences) {
      if (activeCountUpProjectId && occurrence.projectId !== activeCountUpProjectId) continue
      const timer = timersById.get(occurrence.timerId)
      if (
        occurrence.acknowledgedAt === null &&
        timer &&
        isPastTimer(timer, classificationNowMs) &&
        occurrence.targetAtMs === targetMs(timer, classificationNowMs)
      ) {
        activeOccurrences.set(timer.id, occurrence)
      }
    }
    return activeOccurrences
  }, [activeCountUpProjectId, activeTimers, countUpOccurrences, classificationNowMs])
  const pinnedTimers = useMemo(() => activeTimers.filter((timer) => timer.pinned), [activeTimers])
  const countUpTimers = useMemo(
    () =>
      activeTimers
        .filter(
          (timer) => !timer.pinned && countUpOccurrencesByTimer.has(timer.id) && !heldCountUpTimerIds.has(timer.id),
        )
        .sort((left, right) => {
          const leftOccurrence = countUpOccurrencesByTimer.get(left.id)!
          const rightOccurrence = countUpOccurrencesByTimer.get(right.id)!
          const leftNew = leftOccurrence.firstSeenAt === null
          const rightNew = rightOccurrence.firstSeenAt === null
          if (leftNew !== rightNew) return leftNew ? -1 : 1
          return leftNew
            ? rightOccurrence.crossedAt - leftOccurrence.crossedAt
            : leftOccurrence.crossedAt - rightOccurrence.crossedAt
        }),
    [activeTimers, countUpOccurrencesByTimer, heldCountUpTimerIds],
  )
  const upcomingTimers = useMemo(
    () =>
      sortTimers(
        activeTimers.filter(
          (timer) =>
            !timer.pinned &&
            (heldCountUpTimerIds.has(timer.id) ||
              (!countUpOccurrencesByTimer.has(timer.id) && !isPastTimer(timer, classificationNowMs))),
        ),
        sortMode,
        classificationNowMs,
      ),
    [activeTimers, countUpOccurrencesByTimer, classificationNowMs, heldCountUpTimerIds, sortMode],
  )
  const pastTimers = useMemo(
    () =>
      activeTimers
        .filter(
          (timer) =>
            !timer.pinned && !countUpOccurrencesByTimer.has(timer.id) && isPastTimer(timer, classificationNowMs),
        )
        .sort((a, b) => targetMs(b, classificationNowMs) - targetMs(a, classificationNowMs)),
    [activeTimers, countUpOccurrencesByTimer, classificationNowMs],
  )
  const archivedTimers = useMemo(() => {
    const archived = filteredTimers.filter((timer) => timer.archivedAt)
    if (sortMode === "manual") return archived
    return [...archived].sort((a, b) => new Date(b.archivedAt ?? 0).getTime() - new Date(a.archivedAt ?? 0).getTime())
  }, [filteredTimers, sortMode])
  const nextBoundaryMs = useMemo(
    () => nextReclassificationBoundaryMs(activeProjectTimers, classificationNowMs),
    [activeProjectTimers, classificationNowMs],
  )
  const activeOffscreenCountUpTargets = useMemo(() => {
    const activeOccurrenceKeys = new Set(
      countUpOccurrences
        .filter((occurrence) => occurrence.projectId === activeCountUpProjectId && occurrence.acknowledgedAt === null)
        .map((occurrence) => occurrence.key),
    )
    return offscreenCountUpTargets.filter(
      (target) => target.localProjectId === activeProjectId && activeOccurrenceKeys.has(target.key),
    )
  }, [activeCountUpProjectId, activeProjectId, countUpOccurrences, offscreenCountUpTargets])

  useEffect(() => {
    const revealTarget = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return
      const projectId = Reflect.get(event.detail, "projectId")
      const timerId = Reflect.get(event.detail, "timerId")
      const targetAtMs = Reflect.get(event.detail, "targetAtMs")
      if (typeof projectId !== "string" || typeof timerId !== "string") return
      if (targetAtMs !== undefined && (typeof targetAtMs !== "number" || !Number.isSafeInteger(targetAtMs))) return

      const revealKey =
        targetAtMs === undefined
          ? countUpOccurrences.find((candidate) => candidate.timerId === timerId && candidate.acknowledgedAt === null)
              ?.key
          : getCountUpOccurrenceKey(timerId, targetAtMs)
      setCountUpRevealKey(revealKey)

      void navigateToCountUpCard(
        { projectId, timerId, ...(targetAtMs === undefined ? {} : { targetAtMs }) },
        { openProject: openCountUpProject, prepareTarget: prepareCountUpTarget },
      ).then((revealed) => {
        globalThis.setTimeout(() => setCountUpRevealKey(undefined), revealed ? COUNT_UP_HIGHLIGHT_DURATION_MS : 0)
      })
    }
    globalThis.addEventListener(COUNT_UP_VIEW_EVENT, revealTarget)
    return () => globalThis.removeEventListener(COUNT_UP_VIEW_EVENT, revealTarget)
  }, [countUpOccurrences, openCountUpProject, prepareCountUpTarget])

  useEffect(() => {
    if (!hasHydrated) return
    const timeout = globalThis.setTimeout(() => {
      const target = takePendingCountUpTarget()
      if (!target) return
      setCountUpRevealKey(
        target.targetAtMs === undefined ? undefined : getCountUpOccurrenceKey(target.timerId, target.targetAtMs),
      )
      void navigateToCountUpCard(target, {
        openProject: openCountUpProject,
        prepareTarget: prepareCountUpTarget,
      }).then((revealed) => {
        globalThis.setTimeout(() => setCountUpRevealKey(undefined), revealed ? COUNT_UP_HIGHLIGHT_DURATION_MS : 0)
      })
    }, 0)
    return () => globalThis.clearTimeout(timeout)
  }, [hasHydrated, openCountUpProject, prepareCountUpTarget])

  useEffect(() => {
    if (!hasHydrated || sessionPending) return
    if (signedInUserKey) {
      setActiveClientPlan("free")
      runInBackground("home.syncCountUpOccurrences", syncCountUpOccurrences())
      runInBackground(
        "home.autoClaimActiveProject",
        refreshAccountProjectsFromCloud()
          .then(() => maybeAutoClaimActiveProject())
          .then((status) => {
            if (status === "claimed") toast.success(formatMessage("auth.claim.claimed"))
            if (status === "claimed_read_only")
              toast(
                formatMessage("auth.claim.claimedReadOnly", {
                  max: String(getEntitlements().maxProjects),
                }),
              )
          })
          .catch((error) => {
            // Silent failure: the manual claim toast stays as the fallback.
            logClientError("home.autoClaimActiveProject", error)
          }),
      )
      return
    }
    setActiveClientPlan("anonymous")
    removeAccountProjectsFromDevice()
  }, [
    hasHydrated,
    maybeAutoClaimActiveProject,
    refreshAccountProjectsFromCloud,
    removeAccountProjectsFromDevice,
    sessionPending,
    signedInUserKey,
    syncCountUpOccurrences,
  ])

  const releaseCountUpHold = useCallback((timerId: string) => {
    if (countUpInteractionIdsRef.current.has(timerId)) {
      countUpReadyToMoveIdsRef.current.add(timerId)
      return
    }

    countUpReadyToMoveIdsRef.current.delete(timerId)
    const reduceMotion = countUpReducedMotionIdsRef.current.has(timerId)
    runCountUpMove(
      () =>
        setHeldCountUpTimerIds((current) => {
          if (!current.has(timerId)) return current
          const next = new Set(current)
          next.delete(timerId)
          return next
        }),
      reduceMotion,
    )

    if (!reduceMotion) return
    const label = countUpLabelsRef.current.get(timerId)
    if (label) setCountUpAnnouncement(formatMessage("countUp.movedToSectionAnnouncement", { label }))
    const existing = countUpCrossfadeTimeoutsRef.current.get(timerId)
    if (existing !== undefined) globalThis.clearTimeout(existing)
    const timeout = globalThis.setTimeout(() => {
      countUpReducedMotionIdsRef.current.delete(timerId)
      setReducedMotionCountUpTimerIds((current) => {
        if (!current.has(timerId)) return current
        const next = new Set(current)
        next.delete(timerId)
        return next
      })
      countUpCrossfadeTimeoutsRef.current.delete(timerId)
    }, COUNT_UP_CROSSFADE_MS)
    countUpCrossfadeTimeoutsRef.current.set(timerId, timeout)
  }, [])

  const handleCountUpInteractionChange = useCallback(
    (timerId: string, active: boolean) => {
      if (active) {
        countUpInteractionIdsRef.current.add(timerId)
        return
      }
      countUpInteractionIdsRef.current.delete(timerId)
      if (countUpReadyToMoveIdsRef.current.has(timerId)) releaseCountUpHold(timerId)
    },
    [releaseCountUpHold],
  )

  const handleReclassificationBoundary = useCallback(
    (nowMs: number) => {
      for (const timer of activeProjectTimers) {
        const boundary = timerReclassificationBoundaryMs(timer, classificationNowMs)
        if (boundary === null || boundary > nowMs) continue
        const renderedCard = activeProjectId ? findCountUpCard({ projectId: activeProjectId, timerId: timer.id }) : null
        const crossedOutsideViewport = renderedCard === null || !isCountUpCardInViewport(renderedCard)
        const createdCountUpOccurrence = detectTimerZeroCross(timer.id, nowMs)
        if (!createdCountUpOccurrence) continue
        setCountUpAnnouncement(
          formatMessage("countUp.crossedAnnouncement", {
            label: timer.label,
          }),
        )

        if (crossedOutsideViewport && activeProjectId) {
          const targetAtMs = targetMs(timer, classificationNowMs)
          const projectId = activeProject?.cloudProjectId ?? activeProjectId
          const key = getCountUpOccurrenceKey(timer.id, targetAtMs)
          setOffscreenCountUpTargets((current) => {
            if (current.some((target) => target.key === key && target.projectId === projectId)) return current
            return [...current, { key, localProjectId: activeProjectId, projectId, timerId: timer.id, targetAtMs }]
          })
        }

        const isVisibleCard = activeTimers.some((activeTimer) => activeTimer.id === timer.id)
        if (!isVisibleCard || timer.pinned) continue
        countUpLabelsRef.current.set(timer.id, timer.label)
        const reduceMotion = countUpPrefersReducedMotion()
        if (reduceMotion) {
          countUpReducedMotionIdsRef.current.add(timer.id)
          setReducedMotionCountUpTimerIds((current) => new Set(current).add(timer.id))
        }
        setHeldCountUpTimerIds((current) => new Set(current).add(timer.id))
        const existing = countUpHoldTimeoutsRef.current.get(timer.id)
        if (existing !== undefined) globalThis.clearTimeout(existing)
        const timeout = globalThis.setTimeout(() => {
          countUpHoldTimeoutsRef.current.delete(timer.id)
          releaseCountUpHold(timer.id)
        }, COUNT_UP_CROSS_HOLD_MS)
        countUpHoldTimeoutsRef.current.set(timer.id, timeout)
      }
      setClassificationNowMs(nowMs)
    },
    [
      activeProject,
      activeProjectId,
      activeProjectTimers,
      activeTimers,
      classificationNowMs,
      detectTimerZeroCross,
      releaseCountUpHold,
    ],
  )

  const viewOffscreenCountUps = useCallback(() => {
    const newest = activeOffscreenCountUpTargets.reduce<(typeof activeOffscreenCountUpTargets)[number] | null>(
      (current, target) => (!current || (target.targetAtMs ?? 0) > (current.targetAtMs ?? 0) ? target : current),
      null,
    )
    if (!newest) return
    void navigateToCountUpCard(newest, {
      openProject: openCountUpProject,
      prepareTarget: prepareCountUpTarget,
    }).then((revealed) => {
      if (!revealed) return
      setOffscreenCountUpTargets((current) =>
        current.filter((target) => target.localProjectId !== newest.localProjectId),
      )
    })
  }, [activeOffscreenCountUpTargets, openCountUpProject, prepareCountUpTarget])

  useEffect(
    () => () => {
      for (const timeout of countUpHoldTimeoutsRef.current.values()) globalThis.clearTimeout(timeout)
      for (const timeout of countUpCrossfadeTimeoutsRef.current.values()) globalThis.clearTimeout(timeout)
    },
    [],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional clock refresh so changed data classifies against current time, not the last boundary
    if (hasHydrated) setClassificationNowMs(Date.now())
  }, [activeSpaceId, hasHydrated, sortMode, spaces, timerFilters, timers])

  useEffect(() => {
    if (!hasHydrated) return
    runInBackground("home.refreshFollowedTimers", refreshFollowedTimers())
    const id = globalThis.setInterval(() => {
      runInBackground("home.refreshFollowedTimers", refreshFollowedTimers())
    }, 300_000)
    return () => globalThis.clearInterval(id)
  }, [hasHydrated, refreshFollowedTimers])

  useEffect(() => {
    if (!hasHydrated) return
    const onFocus = () => runInBackground("home.refreshActiveProjectFromCloud", refreshActiveProjectFromCloud())
    globalThis.addEventListener("focus", onFocus)
    const id = globalThis.setInterval(
      () => runInBackground("home.refreshActiveProjectFromCloud", refreshActiveProjectFromCloud()),
      300_000,
    )
    return () => {
      globalThis.removeEventListener("focus", onFocus)
      globalThis.clearInterval(id)
    }
  }, [hasHydrated, refreshActiveProjectFromCloud])

  const handleTimerDragEnd = useCallback(
    (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => {
      if (kind === "past" || kind === "countUp") return

      const { active, over } = event
      if (!over || active.id === over.id) return
      const visibleIds = sectionTimers.map((timer) => timer.id)
      const activeIdx = visibleIds.indexOf(String(active.id))
      const overIdx = visibleIds.indexOf(String(over.id))
      if (activeIdx === -1 || overIdx === -1) return

      if (kind === "upcoming") {
        reorderVisibleTimers(arrayMove(visibleIds, activeIdx, overIdx))
      } else {
        const fromIndex = timers.findIndex((timer) => timer.id === active.id)
        const toIndex = timers.findIndex((timer) => timer.id === over.id)
        if (fromIndex === -1 || toIndex === -1) return
        reorderTimers(fromIndex, toIndex)
        if (sortMode !== "manual") setTimerSortMode("manual")
      }

      if (sortMode !== "manual") {
        toast(formatMessage("timer.manualOrder"), {
          id: "manual-sort-after-drag",
        })
      }
    },
    [reorderTimers, reorderVisibleTimers, setTimerSortMode, sortMode, timers],
  )

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {nextBoundaryMs !== null ? (
        <ReclassificationBoundary nextBoundaryMs={nextBoundaryMs} onBoundary={handleReclassificationBoundary} />
      ) : null}
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-slot="count-up-announcer">
        {countUpAnnouncement}
      </div>
      <Header />

      {/* The section constrains the sticky status footer to the timer list area
          so it settles before the content below app/page.tsx scrolls into view. */}
      <section data-slot="timer-list-section" className="relative flex flex-1 flex-col">
        <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-5">
          {hasHydrated ? (
            <>
              <ProjectConflictBanner />
              <ProjectReadOnlyBanner />
              <ProjectClaimToast
                projectId={activeProject?.id}
                projectName={activeProject?.name ?? ""}
                restoreKey={restoreKey}
                cloudProjectId={activeProject?.cloudProjectId}
                timerCount={timers.length}
              />
              <OnboardingBanner timerCount={timers.length} spaceCount={spaces.length} />
              <CountUpStickyBanner count={activeOffscreenCountUpTargets.length} onView={viewOffscreenCountUps} />
              <QuickAddTimer label={quickAddLabel} onLabelChange={setQuickAddLabel} />
              <TimerCollection
                hasActiveProject={Boolean(activeProject)}
                timers={timers}
                activeTimers={activeTimers}
                archivedTimers={archivedTimers}
                pinnedTimers={pinnedTimers}
                countUpTimers={countUpTimers}
                countUpOccurrencesByTimer={countUpOccurrencesByTimer}
                upcomingTimers={upcomingTimers}
                pastTimers={pastTimers}
                nowMs={classificationNowMs}
                sensors={sensors}
                onDragEnd={handleTimerDragEnd}
                onSelectExample={setQuickAddLabel}
                onAcknowledgeCountUps={acknowledgeCountUps}
                onUnacknowledgeCountUps={unacknowledgeCountUps}
                heldCountUpTimerIds={heldCountUpTimerIds}
                reducedMotionCountUpTimerIds={reducedMotionCountUpTimerIds}
                onCountUpInteractionChange={handleCountUpInteractionChange}
                onCountUpSeen={queueCountUpSeen}
                revealCountUpKey={countUpRevealKey}
              />
            </>
          ) : (
            <HomeMainLoadingSkeleton announce={false} />
          )}
        </main>
        <FooterStatusBar />
      </section>
      <IosPwaPrompt />
      <HomeTickEffects
        activeProjectId={activeProject?.cloudProjectId ?? activeProject?.id}
        activeProjectName={activeProject?.name}
        hasHydrated={hasHydrated}
        timers={timers}
      />
    </div>
  )
}
