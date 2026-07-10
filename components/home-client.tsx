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
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { FooterStatusBar } from "@/components/footer"
import { IosPwaPrompt } from "@/components/ios-pwa-prompt"
import { Header } from "@/components/header"
import { HOME_EMPTY_TIMER_EXAMPLES, HomeMainLoadingSkeleton } from "@/components/app-shell-loading"
import { OrganizerBar } from "@/components/organizer-bar"
import { ProjectClaimToast } from "@/components/project-claim-slot"
import { QuickAddTimer } from "@/components/quick-add-timer"
import { TimerAlarmOverlay } from "@/components/timer-alarm-overlay"
import { TimerCard } from "@/components/timer-card"
import { Button } from "@/components/ui/button"
import { useNow } from "@/components/use-now"
import { useLocalTimerAlarms } from "@/components/use-local-timer-alarms"
import { useProjectUrlSync } from "@/hooks/use-project-url-sync"
import { authClient } from "@/lib/auth/auth-client"
import { browserTitle } from "@/lib/browser-title"
import { logClientError } from "@/lib/client-errors"
import { getEntitlements } from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
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

function EmptyState(props: Readonly<{ compact?: boolean; onSelectExample: (label: string) => void }>) {
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
            <Button size="sm" onClick={() => void overwriteCloudProjectVersion()}>
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
            {formatMessage("project.readOnly.banner.description", { max: String(maxProjects) })}
          </div>
          {purgeAt ? (
            <div className="mt-1 text-xs opacity-80">
              {formatMessage("project.readOnly.banner.purgeScheduled", {
                date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(purgeAt)),
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function targetMs(timer: Timer, nowMs: number) {
  return new Date(effectiveTargetDate(timer, nowMs)).getTime()
}

function timerReclassificationBoundaryMs(timer: Timer, nowMs: number) {
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
      const byName = a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
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

type TimerSectionKind = "pinned" | "upcoming" | "past" | "archived"

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
    sortable?: boolean
  }>,
) {
  if (props.timers.length === 0) return null

  const list = (
    <div data-slot={props.dataSlot} className={cn("grid gap-3", props.listClassName)}>
      {props.timers.map((timer) => (
        <TimerCard key={timer.id} timer={timer} nowMs={props.nowMs} sortable={props.sortable} />
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
          {props.title}
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

const ActiveTimerList = memo(function ActiveTimerList(
  props: Readonly<{
    pinnedTimers: Timer[]
    upcomingTimers: Timer[]
    pastTimers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => void
  }>,
) {
  if (props.pinnedTimers.length === 0 && props.upcomingTimers.length === 0 && props.pastTimers.length === 0) return null

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
      />
      <SortableTimerSection
        kind="upcoming"
        headingId="upcoming-timers-heading"
        title={formatMessage("home.upcoming")}
        timers={props.upcomingTimers}
        nowMs={props.nowMs}
        sensors={props.sensors}
        onDragEnd={props.onDragEnd}
      />
      <SortableTimerSection
        kind="past"
        headingId="past-timers-heading"
        title={formatMessage("home.past")}
        timers={props.pastTimers}
        nowMs={props.nowMs}
        sensors={props.sensors}
        onDragEnd={props.onDragEnd}
        sortable={false}
      />
    </div>
  )
})

function scrollToId(id: string) {
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
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
    upcomingTimers: Timer[]
    pastTimers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => void
    onSelectExample: (label: string) => void
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
          upcomingTimers={props.upcomingTimers}
          pastTimers={props.pastTimers}
          nowMs={props.nowMs}
          sensors={props.sensors}
          onDragEnd={props.onDragEnd}
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
    activeProjectName?: string
    hasHydrated: boolean
    timers: Timer[]
  }>,
) {
  const nowMs = useNow()
  const alarmTimers = props.hasHydrated ? props.timers : []
  const localAlarm = useLocalTimerAlarms(alarmTimers, nowMs)

  useEffect(() => {
    if (!props.hasHydrated) return
    document.title = browserTitle({ projectName: props.activeProjectName, timers: props.timers, nowMs })
  }, [props.activeProjectName, props.hasHydrated, nowMs, props.timers])

  return <TimerAlarmOverlay alarm={localAlarm.alarm} onDismiss={localAlarm.dismissAlarm} />
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const session = authClient.useSession()
  const signedInUserKey = session.data?.user?.id ?? session.data?.user?.email ?? null
  const sessionPending = Boolean(session.isPending)
  const [quickAddLabel, setQuickAddLabel] = useState("")
  const [classificationNowMs, setClassificationNowMs] = useState(() => Date.now())
  const visibleSpaceTimers = useMemo(
    () => timers.filter((timer) => matchesActiveSpace(timer, activeSpaceId, spaces)),
    [activeSpaceId, spaces, timers],
  )
  const filteredTimers = useMemo(
    () => visibleSpaceTimers.filter((timer) => timerMatchesFilters(timer, timerFilters, classificationNowMs)),
    [classificationNowMs, timerFilters, visibleSpaceTimers],
  )
  const activeTimers = useMemo(() => filteredTimers.filter((timer) => !timer.archivedAt), [filteredTimers])
  const pinnedTimers = useMemo(() => activeTimers.filter((timer) => timer.pinned), [activeTimers])
  const upcomingTimers = useMemo(
    () =>
      sortTimers(
        activeTimers.filter((timer) => !timer.pinned && !isPastTimer(timer, classificationNowMs)),
        sortMode,
        classificationNowMs,
      ),
    [activeTimers, classificationNowMs, sortMode],
  )
  const pastTimers = useMemo(
    () =>
      activeTimers
        .filter((timer) => !timer.pinned && isPastTimer(timer, classificationNowMs))
        .sort((a, b) => targetMs(b, classificationNowMs) - targetMs(a, classificationNowMs)),
    [activeTimers, classificationNowMs],
  )
  const archivedTimers = useMemo(() => {
    const archived = filteredTimers.filter((timer) => timer.archivedAt)
    if (sortMode === "manual") return archived
    return [...archived].sort((a, b) => new Date(b.archivedAt ?? 0).getTime() - new Date(a.archivedAt ?? 0).getTime())
  }, [filteredTimers, sortMode])
  const nextBoundaryMs = useMemo(
    () => nextReclassificationBoundaryMs(visibleSpaceTimers, classificationNowMs),
    [classificationNowMs, visibleSpaceTimers],
  )

  useEffect(() => {
    if (!hasHydrated || sessionPending) return
    if (signedInUserKey) {
      void refreshAccountProjectsFromCloud()
        .then(() => maybeAutoClaimActiveProject())
        .then((status) => {
          if (status === "claimed") toast.success(formatMessage("auth.claim.claimed"))
          if (status === "claimed_read_only")
            toast(formatMessage("auth.claim.claimedReadOnly", { max: String(getEntitlements().maxProjects) }))
        })
        .catch((error) => {
          // Silent failure: the manual claim toast stays as the fallback.
          logClientError("home.autoClaimActiveProject", error)
        })
      return
    }
    removeAccountProjectsFromDevice()
  }, [
    hasHydrated,
    maybeAutoClaimActiveProject,
    refreshAccountProjectsFromCloud,
    removeAccountProjectsFromDevice,
    sessionPending,
    signedInUserKey,
  ])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional clock refresh so changed data classifies against current time, not the last boundary
    if (hasHydrated) setClassificationNowMs(Date.now())
  }, [activeSpaceId, hasHydrated, sortMode, spaces, timerFilters, timers])

  useEffect(() => {
    if (!hasHydrated) return
    const url = new URL(globalThis.location.href)
    if (!url.searchParams.has("space")) return
    url.searchParams.delete("space")
    globalThis.history.replaceState(null, "", url.toString())
  }, [hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return
    void refreshFollowedTimers()
    const id = globalThis.setInterval(() => {
      void refreshFollowedTimers()
    }, 300_000)
    return () => globalThis.clearInterval(id)
  }, [hasHydrated, refreshFollowedTimers])

  useEffect(() => {
    if (!hasHydrated) return
    const onFocus = () => void refreshActiveProjectFromCloud()
    globalThis.addEventListener("focus", onFocus)
    const id = globalThis.setInterval(() => void refreshActiveProjectFromCloud(), 300_000)
    return () => {
      globalThis.removeEventListener("focus", onFocus)
      globalThis.clearInterval(id)
    }
  }, [hasHydrated, refreshActiveProjectFromCloud])

  const handleTimerDragEnd = useCallback(
    (event: DragEndEvent, sectionTimers: Timer[], kind: TimerSectionKind) => {
      if (kind === "past") return

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
        toast(formatMessage("timer.manualOrder"), { id: "manual-sort-after-drag" })
      }
    },
    [reorderTimers, reorderVisibleTimers, setTimerSortMode, sortMode, timers],
  )

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {nextBoundaryMs !== null ? (
        <ReclassificationBoundary nextBoundaryMs={nextBoundaryMs} onBoundary={setClassificationNowMs} />
      ) : null}
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
              <QuickAddTimer label={quickAddLabel} onLabelChange={setQuickAddLabel} />
              <TimerCollection
                hasActiveProject={Boolean(activeProject)}
                timers={timers}
                activeTimers={activeTimers}
                archivedTimers={archivedTimers}
                pinnedTimers={pinnedTimers}
                upcomingTimers={upcomingTimers}
                pastTimers={pastTimers}
                nowMs={classificationNowMs}
                sensors={sensors}
                onDragEnd={handleTimerDragEnd}
                onSelectExample={setQuickAddLabel}
              />
            </>
          ) : (
            <HomeMainLoadingSkeleton announce={false} />
          )}
        </main>
        <FooterStatusBar />
      </section>
      <IosPwaPrompt />
      <HomeTickEffects activeProjectName={activeProject?.name} hasHydrated={hasHydrated} timers={timers} />
    </div>
  )
}
