"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArchiveIcon, ArchiveRestoreIcon, GripVerticalIcon, TrashIcon } from "lucide-react"
import type { CSSProperties, FocusEvent } from "react"
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from "react"
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

import {
  TimerCardContent,
  TimerCardDesktopActions,
  TimerCardMobileActions,
  TimerImageAttribution,
} from "@/components/timer-card-parts"
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
import { formatMilestoneDisplayLabel } from "@/lib/milestone-display"
import { nextMilestoneAfter } from "@/lib/milestones"
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

function absoluteShareUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : `${globalThis.location.origin}${url}`
}

type TimerCardProps = Readonly<{
  timer: Timer
  nowMs: number
  projectId?: string
  sortable?: boolean
  countUpOccurrence?: CountUpOccurrence
  countUpPlacement?: "section" | "pinned"
  onCountUpInteractionChange?: (active: boolean) => void
  onCountUpSeen?: (key: string) => void
  countUpHolding?: boolean
  countUpCrossfade?: boolean
}>

export const TimerCard = memo(function TimerCard(props: TimerCardProps) {
  const { timer, nowMs } = props
  const session = authClient.useSession()
  const sortable = props.sortable ?? true
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

  const nextMilestone =
    timer.mode === "since" && timer.milestones
      ? nextMilestoneAfter(timer.targetDate, timer.milestones.rules, timer.timezone, nowMs)
      : null
  const ladderComplete =
    timer.mode === "since" &&
    timer.milestones !== undefined &&
    timer.milestones.rules.length > 0 &&
    timer.milestones.rules.every((rule) => "at" in rule) &&
    !nextMilestone
  const milestoneSub = nextMilestone
    ? formatMilestoneDisplayLabel("next", nextMilestone, timer.timezone)
    : ladderComplete
      ? formatMessage("timer.display.ladderComplete")
      : null
  const sub = [formatTargetInTimeZone(effectiveTarget, timer.timezone), timer.timezone, milestoneSub]
    .filter(Boolean)
    .join(" · ")

  const [shareOpen, setShareOpen] = useState(false)
  const [shareLoaded, setShareLoaded] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [shareLoading, setShareLoading] = useState(false)
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
    setShareLoading(true)
    try {
      const res = await fetch("/api/share/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: shareOwnerPayload() }),
      })
      if (!res.ok) return

      const data = (await res.json()) as { url?: string | null }
      if (data?.url) {
        setShareUrl(absoluteShareUrl(data.url))
        if (!timer.sharedAt) {
          updateTimer(timer.id, { sharedAt: new Date().toISOString() })
          await syncToCloud({ force: true })
        }
      }
    } catch (err) {
      logClientError("timerCard.shareStatus", err)
    } finally {
      setShareLoading(false)
    }
  }

  async function createAndCopyShareLink() {
    if (shareUrl) {
      await copyShareLink(shareUrl)
      return
    }

    setShareLoading(true)
    try {
      const synced = await syncToCloud({ force: true })
      if (!synced) throw new PublicClientError("errors.shareLinkFailed")

      const body: Record<string, unknown> = {
        owner: shareOwnerPayload(),
      }

      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw await publicClientErrorFromResponse(res, "errors.shareLinkFailed")

      const data = (await res.json()) as { url?: string }
      if (!data?.url) throw new PublicClientError("errors.shareLinkFailed")
      const url = absoluteShareUrl(data.url)
      setShareUrl(url)
      updateTimer(timer.id, { sharedAt: new Date().toISOString() })
      await syncToCloud({ force: true })
      await copyShareLink(url)
    } catch (err) {
      logClientError("timerCard.shareTimer", err)
      toast.error(safeClientErrorMessage(err, "errors.shareLinkFailed"))
    } finally {
      setShareLoading(false)
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
    if (!shareUrl) void loadExistingShareLink()
  }

  function openEditDialog() {
    setEditLoaded(true)
    setEditOpen(true)
  }

  function openFocusMode() {
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

  function handleMobileCardTap() {
    if (globalThis.window !== undefined && "matchMedia" in globalThis) {
      const mobile = globalThis.matchMedia("(max-width: 767px)").matches
      if (!mobile) return
    }
    if (!isFollowed) openEditDialog()
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
      className="absolute left-1 top-4 z-20 grid size-6 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/45 opacity-100 transition hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
      aria-label={formatMessage("timer.dragReorder")}
      {...listeners}
    >
      <GripVerticalIcon className="size-3.5" />
    </button>
  ) : null

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
      mobileActions={
        <TimerCardMobileActions
          isArchived={isArchived}
          isPinned={isPinned}
          isFollowed={isFollowed}
          notificationsEnabled={notificationsEnabled}
          canMove={canMove}
          onTogglePin={togglePin}
          onToggleNotification={() => void toggleNotification()}
          onOpenShare={openShareDialog}
          onOpenFocus={openFocusMode}
          onOpenEdit={openEditDialog}
          onOpenMove={openMoveDialog}
          onUnfollow={handleUnfollow}
          onDuplicate={handleDuplicate}
          onToggleArchive={toggleArchive}
          onDelete={requestDelete}
          onMenuOpenChange={setCountUpMenuOpen}
        />
      }
      desktopActions={
        <TimerCardDesktopActions
          isArchived={isArchived}
          isPinned={isPinned}
          isFollowed={isFollowed}
          notificationsEnabled={notificationsEnabled}
          canMove={canMove}
          onTogglePin={togglePin}
          onToggleNotification={() => void toggleNotification()}
          onOpenShare={openShareDialog}
          onOpenFocus={openFocusMode}
          onOpenMove={openMoveDialog}
          onOpenEdit={openEditDialog}
          onUnfollow={handleUnfollow}
          onDuplicate={handleDuplicate}
          onToggleArchive={toggleArchive}
          onDelete={requestDelete}
          onMenuOpenChange={setCountUpMenuOpen}
        />
      }
      onMobileCardTap={handleMobileCardTap}
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

  return (
    <div
      ref={setCardNodeRef}
      className={cn(
        "min-w-0 rounded-2xl transition-[background-color,box-shadow] motion-reduce:transition-none data-[attention-highlighted=true]:bg-primary/[0.035] data-[attention-highlighted=true]:ring-2 data-[attention-highlighted=true]:ring-primary/40 data-[attention-highlighted=true]:ring-offset-2 data-[attention-highlighted=true]:ring-offset-background",
        props.countUpCrossfade && "animate-in fade-in-0 duration-300",
      )}
      style={sortableStyle}
      data-count-up-project-id={props.projectId ?? countUpOccurrence?.projectId ?? activeProjectId ?? undefined}
      data-count-up-timer-id={timer.id}
      data-count-up-target-at-ms={countUpOccurrence?.targetAtMs}
      data-count-up-holding={props.countUpHolding || undefined}
      data-count-up-crossfade={props.countUpCrossfade || undefined}
      onFocusCapture={handleCardFocus}
      onBlurCapture={handleCardBlur}
      {...attributes}
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
      <div className="hidden md:block">{cardDiv}</div>

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

      <TimerImageAttribution timer={timer} />
    </div>
  )
})
