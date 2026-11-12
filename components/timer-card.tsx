"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArchiveIcon, ArchiveRestoreIcon, GripVerticalIcon, TrashIcon } from "lucide-react"
import type { CSSProperties, FocusEvent, ReactNode } from "react"
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  SwipeableList,
  SwipeableListItem,
  SwipeAction,
  LeadingActions,
  TrailingActions,
  Type,
} from "react-swipeable-list"
import "react-swipeable-list/dist/styles.css"
import { toast } from "sonner"

import { CompactTimerCardContent } from "@/components/dashboard/compact-timer-card"
import { useCountUpFormat } from "@/components/dashboard/count-up-format"
import {
  TimerMilestoneLine,
  TimerMilestoneReachedValue,
  TimerReminderLine,
} from "@/components/dashboard/timer-card-insight"
import {
  calendarElapsed,
  calendarLead,
  counterShowsMilestone,
  elapsedDays,
  milestoneInsight,
  nextReminder,
} from "@/components/dashboard/timer-insights"
import { useMilestoneMoment } from "@/components/dashboard/use-milestone-moment"
import { useMinuteNow } from "@/components/dashboard/use-minute-now"
import {
  TimerCardContent,
  TimerCardDesktopActions,
  TimerCardMobileActions,
  TimerImageAttribution,
  TimerOverflowActions,
} from "@/components/timer-card-parts"
import { useTimerDetailOpener } from "@/components/timer-detail/timer-detail-opener"
import { useCountUpSeenCard } from "@/components/use-count-up-seen"
import { trackCountUpAnalyticsEvent } from "@/components/plausible-analytics"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { TimerFormSubmitValue } from "@/components/timer-form"
import { authClient } from "@/lib/auth/auth-client"
import { logClientError, safeClientErrorMessage } from "@/lib/client-errors"
import { formatMessage } from "@/lib/i18n/messages"
import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import { PublicClientError, publicClientErrorFromResponse } from "@/lib/public-errors"
import { useTimerStore } from "@/lib/store"
import type { CountUpOccurrence } from "@/lib/stores/count-up-store"
import { getCountUpExpiresAt } from "@/lib/stores/count-up-tracker"
import { timerAlertReadiness } from "@/lib/timer-alert-readiness.client"
import type { Timer } from "@/lib/types"
import { cn, effectiveTargetDate, formatTargetInTimeZone, recurrenceHistory } from "@/lib/utils"

const LazyMoveToProjectDialog = lazy(() =>
  import("@/components/timer-card-move-dialog").then((mod) => ({
    default: mod.MoveToProjectDialog,
  })),
)

const LazyTimerFocusMode = lazy(() =>
  import("@/components/timer-focus-mode").then((mod) => ({
    default: mod.TimerFocusMode,
  })),
)

const LazyTimerForm = lazy(() => import("@/components/timer-form").then((mod) => ({ default: mod.TimerForm })))

const LazyTimerShareDialog = lazy(() =>
  import("@/components/timer-card-share-dialog").then((mod) => ({
    default: mod.TimerShareDialog,
  })),
)

// Progress strips use the blue of the countdown bar when a timer has no colour.
const DEFAULT_ACCENT = "#2563eb"

function absoluteShareUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : `${globalThis.location.origin}${url}`
}

type TimerCardProps = Readonly<{
  timer: Timer
  nowMs: number
  projectId?: string
  // Manual order: the card shows its handle, can be dragged inside its section
  // and offers Move earlier / Move later. Off in every other sort mode.
  sortable?: boolean
  onMove?: (timerId: string, direction: -1 | 1) => void
  canMoveEarlier?: boolean
  canMoveLater?: boolean
  // Set when Manual order has just started: the handle slides in after this delay.
  handleEntranceDelayMs?: number
  // Desktop grid view: the dense card. Phones keep the full card.
  compact?: boolean
  countUpOccurrence?: CountUpOccurrence
  countUpPlacement?: "section" | "pinned"
  onCountUpInteractionChange?: (active: boolean) => void
  onCountUpSeen?: (key: string) => void
  countUpHolding?: boolean
  countUpCrossfade?: boolean
  // "menu": only the actions menu and the dialogs it opens, for hosts that draw
  // the timer themselves (the dial view). The card itself is not rendered.
  variant?: "card" | "menu"
}>

export const TimerCard = memo(function TimerCard(props: TimerCardProps) {
  const { timer, nowMs } = props
  const session = authClient.useSession()
  const sortable = props.sortable ?? false
  // Recurring timers count down to their next derived occurrence; the stored
  // `targetDate` is only the anchor and is never mutated.
  const occurrenceTarget = effectiveTargetDate(timer, nowMs)
  const effectiveTarget = timer.mode === "since" ? timer.targetDate : occurrenceTarget
  const isRecurring = timer.recurrence?.enabled === true
  const history = recurrenceHistory(timer, nowMs)
  const isFollowed = Boolean(timer.sourceShareId)
  const isArchived = Boolean(timer.archivedAt)
  const isPinned = timer.pinned === true && !isArchived
  const notificationsEnabled = timerNotificationsEnabled(timer.notification, timer.notify)
  const isPastTimer = timer.mode !== "since" && new Date(effectiveTarget).getTime() <= nowMs
  const countUpOccurrence = props.countUpOccurrence?.acknowledgedAt === null ? props.countUpOccurrence : undefined
  const countUpExpiresAt = countUpOccurrence ? getCountUpExpiresAt(countUpOccurrence) : null

  const removeTimer = useTimerStore((s) => s.removeTimer)
  const addTimer = useTimerStore((s) => s.addTimer)
  const updateTimer = useTimerStore((s) => s.updateTimer)
  const archiveTimer = useTimerStore((s) => s.archiveTimer)
  const unarchiveTimer = useTimerStore((s) => s.unarchiveTimer)
  const duplicateTimer = useTimerStore((s) => s.duplicateTimer)
  const setPinnedTimer = useTimerStore((s) => s.setPinnedTimer)
  const acknowledgeCountUps = useTimerStore((s) => s.acknowledgeCountUps)
  const unacknowledgeCountUps = useTimerStore((s) => s.unacknowledgeCountUps)
  const deferCountUps = useTimerStore((s) => s.deferCountUps)
  const analyticsCountUpOccurrences = useTimerStore((s) => s.countUpOccurrences)
  const analyticsTimers = useTimerStore((s) => s.timers)
  const unfollowTimer = useTimerStore((s) => s.unfollowTimer)
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const projects = useTimerStore((s) => s.projects)
  const spaces = useTimerStore((s) => s.spaces)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const syncToCloud = useTimerStore((s) => s.syncToCloud)
  const moveTimerToProject = useTimerStore((s) => s.moveTimerToProject)
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const otherProjects = projects.filter((project) => project.id !== activeProjectId)
  const timerSpace = spaces.find((space) => space.id === timer.spaceId)
  const canMove = !isFollowed && otherProjects.length > 0

  function countUpAnalyticsProperties(sectionSizeAdjustment = 0) {
    const timerById = new Map((analyticsTimers ?? []).map((candidate) => [candidate.id, candidate]))
    const storedSectionSize = new Set(
      (analyticsCountUpOccurrences ?? [])
        .filter((event) => {
          const candidate = timerById.get(event.timerId)
          return (
            event.acknowledgedAt === null &&
            candidate !== undefined &&
            !candidate.archivedAt &&
            candidate.pinned !== true
          )
        })
        .map((event) => event.timerId),
    ).size
    const fallbackSectionSize = countUpOccurrence && props.countUpPlacement === "section" ? 1 : 0
    return {
      policy: countUpOccurrence?.policy?.mode,
      secondsFromCrossedAtToFirstSeen:
        countUpOccurrence?.firstSeenAt == null
          ? undefined
          : Math.max(0, (countUpOccurrence.firstSeenAt - countUpOccurrence.crossedAt) / 1_000),
      sectionSize: Math.max(0, (storedSectionSize || fallbackSectionSize) + sectionSizeAdjustment),
    }
  }

  // The card's own clock for what comes next: minute precision is enough for
  // reminders and milestone days, and it keeps the card from re-rendering every second.
  const minuteNowMs = useMinuteNow()
  const targetLine = formatTargetInTimeZone(effectiveTarget, timer.timezone)
  const sub = [
    targetLine && timer.mode === "since" ? formatMessage("timer.card.sinceDate", { date: targetLine }) : targetLine,
    timer.timezone,
  ]
    .filter(Boolean)
    .join(" · ")
  const accent = timer.color || timerSpace?.color || DEFAULT_ACCENT
  const [countUpFormat, , toggleCountUpFormat] = useCountUpFormat(timer.id)
  const milestone = milestoneInsight(timer, minuteNowMs)
  const reached = milestone?.kind === "reached" && !isArchived ? milestone.reached : null
  // The menu-only variant (the dial's actions) shows no card, so it must not claim the card moment.
  const moment = useMilestoneMoment("card", timer.id, props.variant === "menu" ? null : reached)
  const reminder = nextReminder(timer, effectiveTarget, minuteNowMs)
  // On a milestone day the corner shows the reached value, unless the counter
  // already reads it (a days rule in total days, "3 years" in the calendar format).
  // The compact counter always reads total days, whatever format is stored.
  function reachedShownByCounter(compact: boolean) {
    return (
      reached !== null &&
      counterShowsMilestone(
        reached,
        compact ? "days" : countUpFormat,
        elapsedDays(timer.targetDate, minuteNowMs),
        calendarLead(calendarElapsed(timer.targetDate, timer.timezone, minuteNowMs)),
      )
    )
  }
  function renderInsight(compact: boolean): ReactNode {
    if (reached) {
      return reachedShownByCounter(compact) ? null : (
        <TimerMilestoneReachedValue
          reached={reached}
          accent={accent}
          className={cn(
            "transition-opacity ease-fade",
            moment.phase === "done" ? "opacity-100 delay-[160ms] duration-enter" : "opacity-0 duration-0",
          )}
        />
      )
    }
    if (milestone && milestone.kind !== "reached") {
      return <TimerMilestoneLine insight={milestone} nowMs={minuteNowMs} compact={compact} />
    }
    if (reminder) {
      return <TimerReminderLine reminder={reminder} nowMs={minuteNowMs} timezone={timer.timezone} compact={compact} />
    }
    return null
  }
  const insight = renderInsight(false)
  const milestoneProgress =
    milestone?.kind === "reached"
      ? { value: 1, accent, phase: moment.phase }
      : milestone?.kind === "next"
        ? { value: milestone.progress, accent, phase: "done" as const }
        : undefined

  const [shareOpen, setShareOpen] = useState(false)
  const [shareLoaded, setShareLoaded] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [shareLoading, setShareLoading] = useState(false)
  const [showDescription, setShowDescription] = useState(true)
  const [descriptionChoiceMade, setDescriptionChoiceMade] = useState(false)
  const [shareStatusKnown, setShareStatusKnown] = useState(false)
  const [sharePublished, setSharePublished] = useState(false)
  const shareIdentity = JSON.stringify([session.data?.user?.id, activeProject?.cloudProjectId, restoreKey, timer.id])
  const shareRequests = useRef({ identity: shareIdentity, generation: 0, mutating: false })
  useLayoutEffect(() => {
    if (shareRequests.current.identity !== shareIdentity) {
      shareRequests.current = { identity: shareIdentity, generation: 0, mutating: false }
      setShareUrl("")
      setShareLoading(false)
      setShareStatusKnown(false)
      setSharePublished(false)
      setShowDescription(true)
      setDescriptionChoiceMade(false)
    }
    const scope = shareRequests.current
    return () => { scope.generation += 1 }
  }, [shareIdentity])
  const [editOpen, setEditOpen] = useState(false)
  const [editLoaded, setEditLoaded] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusLoaded, setFocusLoaded] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveLoaded, setMoveLoaded] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [countUpMenuOpen, setCountUpMenuOpen] = useState(false)
  const [countUpFocusWithin, setCountUpFocusWithin] = useState(false)
  const [countUpSwipeActive, setCountUpSwipeActive] = useState(false)
  const interactionCallbackRef = useRef(props.onCountUpInteractionChange)

  function shareOwnerPayload() {
    return {
      projectId: activeProject?.cloudProjectId,
      restoreKey,
      timerId: timer.id,
    }
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: timer.id,
    disabled: !sortable,
  })
  const countUpSeenRef = useCountUpSeenCard(
    countUpOccurrence?.firstSeenAt === null ? countUpOccurrence.key : null,
    (key) => props.onCountUpSeen?.(key),
  )
  const setCardNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      countUpSeenRef(node)
    },
    [countUpSeenRef, setNodeRef],
  )

  interactionCallbackRef.current = props.onCountUpInteractionChange
  const countUpInteractionActive = isDragging || countUpMenuOpen || countUpFocusWithin || countUpSwipeActive

  useEffect(() => {
    interactionCallbackRef.current?.(countUpInteractionActive)
  }, [countUpInteractionActive])

  useEffect(
    () => () => {
      interactionCallbackRef.current?.(false)
    },
    [],
  )

  const sortableStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    viewTransitionName:
      countUpOccurrence && !props.countUpCrossfade
        ? `attention-${timer.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`
        : undefined,
  }

  function handleCardFocus(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.target)) setCountUpFocusWithin(true)
  }

  function handleCardBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setCountUpFocusWithin(false)
  }

  function toggleArchive() {
    if (isArchived) {
      unarchiveTimer(timer.id)
      toast(formatMessage("timer.restored"), {
        action: {
          label: formatMessage("common.undo"),
          onClick: () => archiveTimer(timer.id),
        },
      })
      return
    }
    archiveTimer(timer.id)
    toast(formatMessage("timer.archived"), {
      action: {
        label: formatMessage("common.undo"),
        onClick: () => unarchiveTimer(timer.id),
      },
    })
  }

  function togglePin() {
    if (isArchived) return
    setPinnedTimer(timer.id)
    if (countUpOccurrence && !isPinned) {
      acknowledgeCountUps([countUpOccurrence.key])
      trackCountUpAnalyticsEvent("transition_pinned", countUpAnalyticsProperties(-1))
      toast(formatMessage("timer.pinned"), {
        action: {
          label: formatMessage("common.undo"),
          onClick: () => {
            setPinnedTimer(timer.id)
            unacknowledgeCountUps([countUpOccurrence.key])
            trackCountUpAnalyticsEvent(
              "transition_undo",
              countUpAnalyticsProperties(props.countUpPlacement === "pinned" ? 1 : 0),
            )
          },
        },
      })
      return
    }
    toast.success(formatMessage(isPinned ? "timer.unpinned" : "timer.pinned"))
  }

  function acknowledgeActiveCountUp() {
    if (!countUpOccurrence) return
    acknowledgeCountUps([countUpOccurrence.key])
    trackCountUpAnalyticsEvent(
      props.countUpPlacement === "pinned" ? "transition_pinned" : "transition_acknowledged",
      countUpAnalyticsProperties(props.countUpPlacement === "section" ? -1 : 0),
    )
    toast(formatMessage(props.countUpPlacement === "pinned" ? "timer.pinned" : "countUp.acknowledgedEffect"), {
      action: {
        label: formatMessage("common.undo"),
        onClick: () => {
          unacknowledgeCountUps([countUpOccurrence.key])
          trackCountUpAnalyticsEvent("transition_undo", countUpAnalyticsProperties())
        },
      },
    })
  }

  function deferActiveCountUp(durationMs: number | null) {
    if (!countUpOccurrence) return
    deferCountUps([countUpOccurrence.key], durationMs === null ? null : Date.now() + durationMs)
    trackCountUpAnalyticsEvent("transition_extended", countUpAnalyticsProperties())
  }

  async function toggleNotification() {
    if (notificationsEnabled) {
      updateTimer(timer.id, { notify: false })
      toast.success(formatMessage("notifications.disabledForTimer"))
      return
    }

    if (isArchived) {
      toast.error(formatMessage("notifications.enableAfterRestore"))
      return
    }

    if (isPastTimer) {
      toast.error(formatMessage("notifications.futureOnly"))
      return
    }

    const readiness = timerAlertReadiness({
      signedIn: Boolean(session.data?.user),
    })
    if (!readiness.ready) {
      toast.error(formatMessage(readiness.messageKey))
      return
    }

    if (readiness.mode === "local") {
      updateTimer(timer.id, { notify: true })
      toast.success(formatMessage("notifications.alarmEnabled"))
      return
    }

    updateTimer(timer.id, { notify: true })
    toast.success(formatMessage("notifications.enabledForTimer"))
  }

  async function copyShareLink(url: string) {
    await navigator.clipboard.writeText(url)
    toast.success(formatMessage("share.linkCopied"))
  }

  async function loadExistingShareLink() {
    const scope = shareRequests.current
    const duringMutation = scope.mutating
    const generation = duringMutation ? scope.generation : ++scope.generation
    const current = () => !duringMutation && shareRequests.current === scope && scope.generation === generation
    if (!duringMutation) {
      setShareStatusKnown(false)
      setShareLoading(true)
    }
    try {
      const res = await fetch("/api/share/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: shareOwnerPayload() }),
      })
      if (!res.ok || !current()) return

      const data = (await res.json()) as { url?: string | null; showDescription?: boolean }
      if (!current()) return
      setShareStatusKnown(true)
      setSharePublished(Boolean(data?.url))
      if (data?.url) {
        setShowDescription(data.showDescription ?? true)
        setDescriptionChoiceMade(false)
        setShareUrl(absoluteShareUrl(data.url))
        if (!timer.sharedAt) {
          updateTimer(timer.id, { sharedAt: new Date().toISOString() })
          await syncToCloud({ force: true })
        }
      } else {
        setShareUrl("")
      }
    } catch (err) {
      if (current()) logClientError("timerCard.shareStatus", err)
    } finally {
      if (current()) setShareLoading(false)
    }
  }

  async function createAndCopyShareLink() {
    if (shareUrl) {
      await copyShareLink(shareUrl)
      return
    }

    const scope = shareRequests.current
    if (scope.mutating) return
    const generation = ++scope.generation
    scope.mutating = true
    const current = () => shareRequests.current === scope && scope.generation === generation
    let refreshStatus = false
    setShareLoading(true)
    try {
      const synced = await syncToCloud({ force: true })
      if (!current()) return
      if (!synced) throw new PublicClientError("errors.shareLinkFailed")

      const body: Record<string, unknown> = {
        owner: shareOwnerPayload(),
        ...(shareStatusKnown || descriptionChoiceMade ? { showDescription } : {}),
      }

      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!current()) return
      if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.shareLinkFailed")

      const data = (await res.json()) as { url?: string }
      if (!current()) return
      if (!data?.url) throw new PublicClientError("errors.shareLinkFailed")
      const url = absoluteShareUrl(data.url)
      setShareUrl(url)
      setSharePublished(true)
      refreshStatus = !shareStatusKnown
      updateTimer(timer.id, { sharedAt: new Date().toISOString() })
      await syncToCloud({ force: true })
      if (current()) await copyShareLink(url)
    } catch (err) {
      if (current()) {
        logClientError("timerCard.shareTimer", err)
        toast.error(safeClientErrorMessage(err, "errors.shareLinkFailed"))
      }
    } finally {
      if (current()) {
        scope.mutating = false
        setShareLoading(false)
        if (refreshStatus) void loadExistingShareLink()
      }
    }
  }

  async function changeShowDescription(value: boolean) {
    const scope = shareRequests.current
    if (scope.mutating) return
    const previous = showDescription
    setShowDescription(value)
    setDescriptionChoiceMade(true)
    if (!sharePublished) return
    const generation = ++scope.generation
    scope.mutating = true
    const current = () => shareRequests.current === scope && scope.generation === generation
    setShareLoading(true)
    try {
      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: shareOwnerPayload(), showDescription: value }),
      })
      if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.shareLinkFailed")
    } catch (err) {
      if (current()) {
        setShowDescription(previous)
        logClientError("timerCard.shareTimer", err)
        toast.error(safeClientErrorMessage(err, "errors.shareLinkFailed"))
      }
    } finally {
      if (current()) {
        scope.mutating = false
        setShareLoading(false)
      }
    }
  }

  function requestDelete() {
    // Deleting a shared timer breaks its public link and any embeds on other
    // sites, so it needs an explicit confirmation instead of instant delete.
    if (timer.sharedAt) {
      setConfirmDeleteOpen(true)
      return
    }
    handleDelete()
  }

  function handleDelete() {
    const snapshot = timer
    removeTimer(timer.id)
    toast(formatMessage("timer.deleted"), {
      action: {
        label: formatMessage("common.undo"),
        onClick: () => {
          const restored = addTimer({
            id: snapshot.id,
            label: snapshot.label,
            description: snapshot.description,
            url: snapshot.url,
            targetDate: snapshot.targetDate,
            timezone: snapshot.timezone,
            color: snapshot.color,
            sharedAt: snapshot.sharedAt,
            sourceShareId: snapshot.sourceShareId,
            notify: snapshot.notify,
            recurrence: snapshot.recurrence,
            spaceId: snapshot.spaceId,
            image: snapshot.image,
            archivedAt: snapshot.archivedAt,
            pinned: snapshot.pinned,
            afterZero: snapshot.afterZero,
          })
          if (!restored) toast.error(formatMessage("entry.limitReachedToast"))
        },
      },
    })
  }

  function openShareDialog() {
    setShareLoaded(true)
    setShareOpen(true)
    if (!shareLoading) void loadExistingShareLink()
  }

  function openEditDialog() {
    setEditLoaded(true)
    setEditOpen(true)
  }

  // Focus mode returns focus to where it was opened from, or to the card when the
  // detail view handed over to it (the detail view is gone by then).
  const focusReturnRef = useRef<HTMLElement | null>(null)
  function openFocusMode(returnFocusTo?: HTMLElement | null) {
    focusReturnRef.current = returnFocusTo ?? null
    setFocusLoaded(true)
    setFocusOpen(true)
  }

  function openMoveDialog() {
    setMoveLoaded(true)
    setMoveOpen(true)
  }

  function handleUnfollow() {
    unfollowTimer(timer.id)
    toast.success(formatMessage("timer.unfollowed"))
  }

  function handleEditSubmit(nextTimer: TimerFormSubmitValue) {
    updateTimer(timer.id, nextTimer)
    setShareUrl("")
  }

  function handleDuplicate() {
    duplicateTimer(timer.id)
    toast.success(formatMessage(isFollowed ? "timer.addCopy" : "timer.duplicated"))
  }

  function handleMoveToProject(projectId: string) {
    const target = projects.find((project) => project.id === projectId)
    const moved = moveTimerToProject(timer.id, projectId)
    const name = target?.name ?? ""
    if (moved) toast.success(formatMessage("timer.move.success", { name }))
    else toast.error(formatMessage("timer.move.full", { name }))
    setMoveOpen(false)
  }

  const leadingActions = () => (
    <LeadingActions>
      <SwipeAction onClick={toggleArchive}>
        <div className="flex items-center justify-center gap-2 bg-slate-700 px-5 text-white dark:bg-slate-200 dark:text-slate-950">
          {isArchived ? <ArchiveRestoreIcon className="size-5" /> : <ArchiveIcon className="size-5" />}
          <span className="text-sm font-medium">
            {formatMessage(isArchived ? "timer.mobileRestore" : "timer.mobileArchive")}
          </span>
        </div>
      </SwipeAction>
    </LeadingActions>
  )

  const trailingActions = () => (
    <TrailingActions>
      <SwipeAction onClick={requestDelete}>
        <div className="flex items-center justify-center gap-2 bg-red-500 px-5 text-white">
          <TrashIcon className="size-5" />
          <span className="text-sm font-medium">{formatMessage("timer.mobileDelete")}</span>
        </div>
      </SwipeAction>
    </TrailingActions>
  )

  const dragHandle = sortable ? (
    <button
      type="button"
      data-timer-card-action=""
      data-slot="timer-drag-handle"
      className={cn(
        "relative z-20 -my-1 -ml-1 grid h-6 w-5 shrink-0 cursor-grab touch-manipulation select-none place-items-center rounded-md [-webkit-touch-callout:none] text-muted-foreground/60 outline-none hover:bg-muted hover:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing",
        props.handleEntranceDelayMs === undefined
          ? ""
          : "animate-in fade-in-0 slide-in-from-left-2 fill-mode-backwards duration-enter ease-move motion-reduce:slide-in-from-left-0",
      )}
      style={
        props.handleEntranceDelayMs === undefined ? undefined : { animationDelay: `${props.handleEntranceDelayMs}ms` }
      }
      {...attributes}
      {...listeners}
      aria-label={formatMessage("timer.dragReorder", { label: timer.label })}
    >
      <GripVerticalIcon className="size-3.5" />
    </button>
  ) : null
  const reorder = sortable
    ? {
        onMoveEarlier: props.canMoveEarlier ? () => props.onMove?.(timer.id, -1) : undefined,
        onMoveLater: props.canMoveLater ? () => props.onMove?.(timer.id, 1) : undefined,
      }
    : undefined

  // One detail view per card. Its trigger is placed in the phone and the desktop
  // tree; only the visible one can be clicked. Drags start on the handle, which
  // stacks above it.
  const { trigger: detailOpener, dialog: detailDialog } = useTimerDetailOpener({
    timer,
    space: timerSpace,
    signedIn: Boolean(session.data?.user),
    onEditSubmit: isFollowed ? undefined : handleEditSubmit,
    onShare: openShareDialog,
    onFocus: openFocusMode,
    // Focus mode is mounted (closed) while the detail view is open, so the hand-over
    // from the detail view starts at once.
    onOpen: () => {
      setFocusLoaded(true)
      if (!isFollowed) void loadExistingShareLink()
    },
    onCopyShareLink: shareUrl ? () => void copyShareLink(shareUrl) : undefined,
    shareDescription: isFollowed || !shareStatusKnown ? undefined : { value: showDescription, disabled: shareLoading, onChange: (value) => void changeShowDescription(value) },
  })

  const cardDiv = (
    <TimerCardContent
      timer={timer}
      effectiveTarget={effectiveTarget}
      nowMs={nowMs}
      sub={sub}
      isArchived={isArchived}
      isPinned={isPinned}
      isRecurring={isRecurring}
      history={history}
      space={timerSpace}
      dragHandle={dragHandle}
      insight={insight}
      countUpFormat={timer.mode === "since" ? countUpFormat : undefined}
      onToggleCountUpFormat={timer.mode === "since" ? toggleCountUpFormat : undefined}
      milestoneDay={reached ? { accent, phase: moment.phase, rolling: moment.rolling, onReplay: moment.replay } : undefined}
      milestoneProgress={milestoneProgress}
      mobileActions={
        <TimerCardMobileActions
          timerId={timer.id}
          isArchived={isArchived}
          isPinned={isPinned}
          isFollowed={isFollowed}
          notificationsEnabled={notificationsEnabled}
          canMove={canMove}
          onTogglePin={togglePin}
          onToggleNotification={() => void toggleNotification()}
          onOpenShare={openShareDialog}
          onOpenFocus={() => openFocusMode()}
          onOpenEdit={openEditDialog}
          onOpenMove={openMoveDialog}
          onUnfollow={handleUnfollow}
          onDuplicate={handleDuplicate}
          onToggleArchive={toggleArchive}
          onDelete={requestDelete}
          onMenuOpenChange={setCountUpMenuOpen}
          reorder={reorder}
        />
      }
      desktopActions={
        <TimerCardDesktopActions
          timerId={timer.id}
          isArchived={isArchived}
          isPinned={isPinned}
          isFollowed={isFollowed}
          notificationsEnabled={notificationsEnabled}
          canMove={canMove}
          onTogglePin={togglePin}
          onToggleNotification={() => void toggleNotification()}
          onOpenShare={openShareDialog}
          onOpenFocus={() => openFocusMode()}
          onOpenMove={openMoveDialog}
          onOpenEdit={openEditDialog}
          onUnfollow={handleUnfollow}
          onDuplicate={handleDuplicate}
          onToggleArchive={toggleArchive}
          onDelete={requestDelete}
          onMenuOpenChange={setCountUpMenuOpen}
          reorder={reorder}
        />
      }
      detailOpener={detailOpener}
      nowCountingUp={Boolean(countUpOccurrence)}
      countUpBadgeLabel={
        countUpOccurrence
          ? formatMessage(countUpOccurrence.firstSeenAt === null ? "countUp.newBadge" : "countUp.badge")
          : undefined
      }
      countUpExpiresAt={countUpExpiresAt}
      countUpPrimaryLabel={
        countUpOccurrence
          ? formatMessage(props.countUpPlacement === "pinned" ? "countUp.keepPinned" : "countUp.acknowledge")
          : undefined
      }
      countUpPrimaryDescription={
        countUpOccurrence && props.countUpPlacement === "section"
          ? formatMessage("countUp.acknowledgeTooltip")
          : undefined
      }
      onCountUpPrimary={countUpOccurrence ? acknowledgeActiveCountUp : undefined}
      onDeferCountUp={countUpOccurrence ? deferActiveCountUp : undefined}
      onCountUpMenuOpenChange={setCountUpMenuOpen}
    />
  )

  const dialogs = (
    <>
      {isFollowed || !editLoaded ? null : (
        <Suspense fallback={null}>
          <LazyTimerForm
            mode="edit"
            initial={timer}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSubmit={handleEditSubmit}
          />
        </Suspense>
      )}

      {shareLoaded ? (
        <Suspense fallback={null}>
          <LazyTimerShareDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            shareUrl={shareUrl}
            shareLoading={shareLoading}
            hasSharedMarker={Boolean(timer.sharedAt)}
            timerLabel={timer.label}
            hasDescription={Boolean(timer.description?.trim()) && shareStatusKnown}
            showDescription={showDescription}
            onShowDescriptionChange={(value) => void changeShowDescription(value)}
            onCreateAndCopy={() => void createAndCopyShareLink()}
          />
        </Suspense>
      ) : null}

      {focusLoaded ? (
        <Suspense fallback={null}>
          <LazyTimerFocusMode
            open={focusOpen}
            timerLabel={timer.label}
            targetDateIsoUtc={effectiveTarget}
            timer={timer}
            accentColor={timer.color || timerSpace?.color}
            space={timerSpace}
            returnFocusRef={focusReturnRef}
            onClose={() => setFocusOpen(false)}
          />
        </Suspense>
      ) : null}

      {moveLoaded ? (
        <Suspense fallback={null}>
          <LazyMoveToProjectDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            projects={otherProjects.map((project) => ({
              id: project.id,
              name: project.name,
            }))}
            onMove={handleMoveToProject}
          />
        </Suspense>
      ) : null}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{formatMessage("timer.deleteShared.title")}</AlertDialogTitle>
            <AlertDialogDescription>{formatMessage("timer.deleteShared.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{formatMessage("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              {formatMessage("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (props.variant === "menu") {
    return (
      <>
        <TimerOverflowActions
          isArchived={isArchived}
          isFollowed={isFollowed}
          notificationsEnabled={notificationsEnabled}
          canMove={canMove}
          onOpenMove={openMoveDialog}
          onOpenEdit={openEditDialog}
          onToggleNotification={() => void toggleNotification()}
          onOpenShare={openShareDialog}
          onUnfollow={handleUnfollow}
          onDuplicate={handleDuplicate}
          onToggleArchive={toggleArchive}
          onDelete={requestDelete}
        />
        {dialogs}
      </>
    )
  }

  return (
    <div
      ref={setCardNodeRef}
      className={cn(
        "min-w-0 rounded-2xl transition-[background-color,box-shadow] motion-reduce:transition-none data-[attention-highlighted=true]:bg-primary/[0.035] data-[attention-highlighted=true]:ring-2 data-[attention-highlighted=true]:ring-primary/40 data-[attention-highlighted=true]:ring-offset-2 data-[attention-highlighted=true]:ring-offset-background",
        props.countUpCrossfade && "animate-in fade-in-0 duration-enter ease-fade",
      )}
      style={sortableStyle}
      data-count-up-project-id={props.projectId ?? countUpOccurrence?.projectId ?? activeProjectId ?? undefined}
      data-count-up-timer-id={timer.id}
      data-flip-key={timer.id}
      data-count-up-target-at-ms={countUpOccurrence?.targetAtMs}
      data-count-up-holding={props.countUpHolding || undefined}
      data-count-up-crossfade={props.countUpCrossfade || undefined}
      onFocusCapture={handleCardFocus}
      onBlurCapture={handleCardBlur}
    >
      {/* Mobile: swipeable wrapper. Swipe right = archive/restore, swipe left = delete */}
      <div className="flex min-w-0 overflow-hidden md:hidden">
        <SwipeableList type={Type.IOS} fullSwipe>
          <SwipeableListItem
            leadingActions={leadingActions()}
            trailingActions={trailingActions()}
            onSwipeStart={() => setCountUpSwipeActive(true)}
            onSwipeEnd={() => setCountUpSwipeActive(false)}
          >
            {cardDiv}
          </SwipeableListItem>
        </SwipeableList>
      </div>
      <div className="hidden h-full md:block">
        {props.compact && !countUpOccurrence ? (
          <CompactTimerCardContent
            timer={timer}
            effectiveTarget={effectiveTarget}
            nowMs={nowMs}
            sub={sub}
            isArchived={isArchived}
            isPinned={isPinned}
            isRecurring={isRecurring}
            history={history}
            space={timerSpace}
            dragHandle={dragHandle}
            insight={renderInsight(true)}
            milestoneDay={reached ? { accent, phase: moment.phase, rolling: moment.rolling, onReplay: moment.replay } : undefined}
            milestoneProgress={milestoneProgress}
            detailOpener={detailOpener}
            onOpenFocus={() => openFocusMode()}
            onTogglePin={togglePin}
            menu={{
              isArchived,
              isFollowed,
              notificationsEnabled,
              canMove,
              onOpenMove: openMoveDialog,
              onOpenEdit: openEditDialog,
              onToggleNotification: () => void toggleNotification(),
              onOpenShare: openShareDialog,
              onUnfollow: handleUnfollow,
              onDuplicate: handleDuplicate,
              onToggleArchive: toggleArchive,
              onDelete: requestDelete,
              onMenuOpenChange: setCountUpMenuOpen,
              reorder,
            }}
          />
        ) : (
          cardDiv
        )}
      </div>

      {dialogs}
      {detailDialog}

      <TimerImageAttribution timer={timer} />
    </div>
  )
})
