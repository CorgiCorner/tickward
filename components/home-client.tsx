"use client"

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { AlertTriangleIcon, KeyIcon, TimerIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
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
import { authClient } from "@/lib/auth/auth-client"
import { browserTitle } from "@/lib/browser-title"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { timerMatchesFilters } from "@/lib/timer-filters"
import type { Timer, TimerSortMode } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import { effectiveTargetDate } from "@/lib/utils"

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
    <div className={[props.compact ? "mt-6" : "mt-0", "rounded-3xl border bg-background p-10 text-center"].join(" ")}>
      <TimerIcon className="mx-auto size-10 text-muted-foreground" />
      <div className="mt-4 text-base font-semibold">{formatMessage("home.empty.title")}</div>
      <div className="mt-2 text-sm text-muted-foreground">{formatMessage("home.empty.description")}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
        {HOME_EMPTY_TIMER_EXAMPLES.map((messageKey) => {
          const label = formatMessage(messageKey)
          return (
            <button
              key={messageKey}
              type="button"
              className="rounded-full border px-2.5 py-1 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              onClick={() => props.onSelectExample(label)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="mt-5 text-sm text-muted-foreground">{formatMessage("home.empty.getStarted")}</div>
    </div>
  )
}

function FilteredEmptyState() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed bg-background p-8 text-center">
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

function targetMs(timer: Timer, nowMs: number) {
  return new Date(effectiveTargetDate(timer, nowMs)).getTime()
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

function ActiveTimerList(
  props: Readonly<{
    pinnedTimer: Timer | undefined
    sortableTimers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent) => void
  }>,
) {
  if (!props.pinnedTimer && props.sortableTimers.length === 0) return null

  return (
    <div data-slot="timer-list" className="-mx-4 grid gap-4 md:mx-0">
      {props.pinnedTimer ? (
        <TimerCard key={props.pinnedTimer.id} timer={props.pinnedTimer} nowMs={props.nowMs} sortable={false} />
      ) : null}

      {props.sortableTimers.length > 0 ? (
        <DndContext sensors={props.sensors} collisionDetection={closestCenter} onDragEnd={props.onDragEnd}>
          <SortableContext items={props.sortableTimers.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="grid gap-4">
              {props.sortableTimers.map((t) => (
                <TimerCard key={t.id} timer={t} nowMs={props.nowMs} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}
    </div>
  )
}

function ArchivedTimerList(props: Readonly<{ timers: Timer[]; nowMs: number }>) {
  if (props.timers.length === 0) return null

  return (
    <section className="mt-6 border-t border-dashed border-border pt-5">
      <div className="mb-3 text-xs font-medium uppercase text-muted-foreground">{formatMessage("home.archived")}</div>
      <div data-slot="archived-timer-list" className="-mx-4 grid gap-4 md:mx-0">
        {props.timers.map((t) => (
          <TimerCard key={t.id} timer={t} nowMs={props.nowMs} sortable={false} />
        ))}
      </div>
    </section>
  )
}

function TimerCollection(
  props: Readonly<{
    hasActiveProject: boolean
    timers: Timer[]
    activeTimers: Timer[]
    archivedTimers: Timer[]
    pinnedTimer: Timer | undefined
    sortableTimers: Timer[]
    nowMs: number
    sensors: ReturnType<typeof useSensors>
    onDragEnd: (event: DragEndEvent) => void
    onSelectExample: (label: string) => void
  }>,
) {
  if (props.timers.length === 0) {
    return (
      <>
        {props.hasActiveProject ? <OrganizerBar /> : null}
        <EmptyState compact={!props.hasActiveProject} onSelectExample={props.onSelectExample} />
      </>
    )
  }

  return (
    <>
      <OrganizerBar />
      {props.activeTimers.length > 0 ? (
        <ActiveTimerList
          pinnedTimer={props.pinnedTimer}
          sortableTimers={props.sortableTimers}
          nowMs={props.nowMs}
          sensors={props.sensors}
          onDragEnd={props.onDragEnd}
        />
      ) : null}
      <ArchivedTimerList timers={props.archivedTimers} nowMs={props.nowMs} />
      {props.activeTimers.length === 0 && props.archivedTimers.length === 0 ? <FilteredEmptyState /> : null}
    </>
  )
}

export function HomeClient() {
  const hasHydrated = useTimerStore((s) => s.hasHydrated)
  const refreshAccountProjectsFromCloud = useTimerStore((s) => s.refreshAccountProjectsFromCloud)
  const removeAccountProjectsFromDevice = useTimerStore((s) => s.removeAccountProjectsFromDevice)
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const timers = useTimerStore((s) => s.timers)
  const spaces = useTimerStore((s) => s.spaces)
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId)
  const sortMode = useTimerStore((s) => s.sortMode)
  const timerFilters = useTimerStore((s) => s.timerFilters)
  const nowMs = useNow()
  const refreshFollowedTimers = useTimerStore((s) => s.refreshFollowedTimers)
  const refreshActiveProjectFromCloud = useTimerStore((s) => s.refreshActiveProjectFromCloud)
  const reorderVisibleTimers = useTimerStore((s) => s.reorderVisibleTimers)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const session = authClient.useSession()
  const signedInUserKey = session.data?.user?.id ?? session.data?.user?.email ?? null
  const sessionPending = Boolean(session.isPending)
  const [quickAddLabel, setQuickAddLabel] = useState("")
  const filteredTimers = useMemo(
    () =>
      timers.filter(
        (timer) => matchesActiveSpace(timer, activeSpaceId, spaces) && timerMatchesFilters(timer, timerFilters),
      ),
    [activeSpaceId, spaces, timerFilters, timers],
  )
  const activeTimers = useMemo(() => filteredTimers.filter((timer) => !timer.archivedAt), [filteredTimers])
  const pinnedTimer = activeTimers.find((timer) => timer.pinned)
  const sortableActiveTimers = useMemo(
    () =>
      sortTimers(
        activeTimers.filter((timer) => !timer.pinned),
        sortMode,
        nowMs,
      ),
    [activeTimers, nowMs, sortMode],
  )
  const archivedTimers = useMemo(
    () =>
      [...filteredTimers]
        .filter((timer) => timer.archivedAt)
        .sort((a, b) => new Date(b.archivedAt ?? 0).getTime() - new Date(a.archivedAt ?? 0).getTime()),
    [filteredTimers],
  )

  useEffect(() => {
    if (!hasHydrated) return
    document.title = browserTitle({ projectName: activeProject?.name, timers, nowMs })
  }, [activeProject?.name, hasHydrated, nowMs, timers])

  useEffect(() => {
    if (!hasHydrated || sessionPending) return
    if (signedInUserKey) {
      void refreshAccountProjectsFromCloud()
      return
    }
    removeAccountProjectsFromDevice()
  }, [hasHydrated, refreshAccountProjectsFromCloud, removeAccountProjectsFromDevice, sessionPending, signedInUserKey])

  useEffect(() => {
    if (!hasHydrated) return
    const url = new URL(globalThis.location.href)
    if (!url.searchParams.has("space")) return
    url.searchParams.delete("space")
    globalThis.history.replaceState(null, "", url.toString())
  }, [hasHydrated])

  const localAlarm = useLocalTimerAlarms(timers, nowMs)

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

  function handleTimerDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const visibleIds = sortableActiveTimers.map((timer) => timer.id)
    const activeIdx = visibleIds.indexOf(String(active.id))
    const overIdx = visibleIds.indexOf(String(over.id))
    if (activeIdx === -1 || overIdx === -1) return
    reorderVisibleTimers(arrayMove(visibleIds, activeIdx, overIdx))
    if (sortMode !== "manual") {
      toast(formatMessage("timer.manualOrder"), { id: "manual-sort-after-drag" })
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-zinc-50 dark:bg-black">
      <Header />

      {/* The section constrains the sticky status footer to the timer list area
          so it settles before the content below app/page.tsx scrolls into view. */}
      <section data-slot="timer-list-section" className="relative flex flex-1 flex-col">
        <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-6">
          {hasHydrated ? (
            <>
              <ProjectConflictBanner />
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
                pinnedTimer={pinnedTimer}
                sortableTimers={sortableActiveTimers}
                nowMs={nowMs}
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
      <TimerAlarmOverlay alarm={localAlarm.alarm} onDismiss={localAlarm.dismissAlarm} />
    </div>
  )
}
