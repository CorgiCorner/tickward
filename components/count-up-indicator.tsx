"use client"

import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo } from "react"
import { toast } from "sonner"

import {
  COUNT_UP_VIEW_EVENT,
  countUpHomeHref,
  storePendingCountUpTarget,
  type CountUpNavigationTarget,
} from "@/components/count-up-navigation"
import { aggregateCountUpAnalyticsPolicy, trackCountUpAnalyticsEvent } from "@/components/plausible-analytics"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"

export { COUNT_UP_VIEW_EVENT }

type CountUpNotificationAction =
  | { action: "review"; kind: "review" }
  | {
      action: "acknowledge" | "view"
      kind: "timer"
      projectId: string
      timerId: string
      targetAtMs: number
    }

const COUNT_UP_NOTIFICATION_TYPES = new Set([
  "TIMER_COUNT_UP_NOTIFICATION_ACTION",
  "TIMER_ATTENTION_NOTIFICATION_ACTION",
])

export function parseCountUpNotificationAction(value: unknown): CountUpNotificationAction | null {
  if (!value || typeof value !== "object") return null
  const type = Reflect.get(value, "type")
  const action = Reflect.get(value, "action")
  const kind = Reflect.get(value, "kind")
  if (!COUNT_UP_NOTIFICATION_TYPES.has(type)) return null
  if (kind === "review" && action === "review") return { action, kind }

  const projectId = Reflect.get(value, "projectId")
  const timerId = Reflect.get(value, "timerId")
  const targetAtMs = Reflect.get(value, "targetAtMs")
  if (
    kind !== "timer" ||
    (action !== "view" && action !== "acknowledge") ||
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    typeof timerId !== "string" ||
    timerId.length === 0 ||
    typeof targetAtMs !== "number" ||
    !Number.isSafeInteger(targetAtMs) ||
    targetAtMs < 0
  ) {
    return null
  }
  return { action, kind, projectId, timerId, targetAtMs }
}

export function parseCountUpNotificationHash(hash: string): CountUpNotificationAction | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
  const kind = params.get("count-up") ?? params.get("attention")
  if (kind === "review") return { action: "review", kind: "review" }
  if (kind !== "timer") return null
  const targetAtMs = Number(params.get("targetAtMs"))
  return parseCountUpNotificationAction({
    type: "TIMER_COUNT_UP_NOTIFICATION_ACTION",
    kind: "timer",
    action: params.get("action"),
    projectId: params.get("projectId"),
    timerId: params.get("timerId"),
    targetAtMs,
  })
}

/**
 * Keeps notification routing alive without rendering a global count-up summary.
 * Cross-project notifications open the newest active occurrence in its own project;
 * the project switcher exposes the remaining per-project queues.
 */
export function CountUpNotificationRouter() {
  const pathname = usePathname()
  const router = useRouter()
  const hasHydrated = useTimerStore((state) => state.hasHydrated)
  const countUpOccurrences = useTimerStore((state) => state.countUpOccurrences)
  const timers = useTimerStore((state) => state.timers)
  const acknowledgeCountUpsForProject = useTimerStore((state) => state.acknowledgeCountUpsForProject)
  const unacknowledgeCountUpsForProject = useTimerStore((state) => state.unacknowledgeCountUpsForProject)
  const openCountUpProject = useTimerStore((state) => state.openCountUpProject)
  const activeOccurrences = useMemo(
    () => countUpOccurrences.filter((occurrence) => occurrence.acknowledgedAt === null),
    [countUpOccurrences],
  )

  const analyticsProperties = useCallback(
    (occurrence?: (typeof countUpOccurrences)[number], sectionSizeAdjustment = 0) => {
      const timerById = new Map(timers.map((timer) => [timer.id, timer]))
      const sectionSize = new Set(
        activeOccurrences
          .filter((activeOccurrence) => {
            const timer = timerById.get(activeOccurrence.timerId)
            return timer !== undefined && !timer.archivedAt && timer.pinned !== true
          })
          .map((activeOccurrence) => activeOccurrence.timerId),
      ).size
      return {
        policy:
          occurrence?.policy?.mode ??
          aggregateCountUpAnalyticsPolicy(activeOccurrences.map((activeOccurrence) => activeOccurrence.policy?.mode)),
        secondsFromCrossedAtToFirstSeen:
          occurrence?.firstSeenAt == null
            ? undefined
            : Math.max(0, (occurrence.firstSeenAt - occurrence.crossedAt) / 1_000),
        sectionSize: Math.max(0, sectionSize + sectionSizeAdjustment),
      }
    },
    [activeOccurrences, timers],
  )

  const openTarget = useCallback(
    (target: CountUpNavigationTarget) => {
      openCountUpProject(target.projectId)
      if (document.querySelector("[data-slot='timer-list-section']")) {
        globalThis.dispatchEvent(new CustomEvent(COUNT_UP_VIEW_EVENT, { detail: target }))
        return
      }
      storePendingCountUpTarget(target)
      router.push(countUpHomeHref(pathname))
    },
    [openCountUpProject, pathname, router],
  )

  const handleNotificationAction = useCallback(
    (payload: CountUpNotificationAction) => {
      const activeOccurrence =
        payload.kind === "review"
          ? activeOccurrences.toSorted((left, right) => right.crossedAt - left.crossedAt)[0]
          : activeOccurrences.find(
              (occurrence) =>
                occurrence.projectId === payload.projectId &&
                occurrence.timerId === payload.timerId &&
                occurrence.targetAtMs === payload.targetAtMs,
            )
      if (!activeOccurrence) return false
      const projectId = payload.kind === "timer" ? payload.projectId : activeOccurrence.projectId
      if (!projectId) return false

      if (payload.kind === "timer" && payload.action === "acknowledge") {
        acknowledgeCountUpsForProject(projectId, [activeOccurrence.key])
        toast(formatMessage("countUp.acknowledgedEffect"), {
          action: {
            label: formatMessage("common.undo"),
            onClick: () => unacknowledgeCountUpsForProject(projectId, [activeOccurrence.key]),
          },
        })
        trackCountUpAnalyticsEvent("transition_acknowledged", analyticsProperties(activeOccurrence, -1))
        return true
      }

      trackCountUpAnalyticsEvent("transition_jump_clicked", analyticsProperties(activeOccurrence))
      openTarget({
        projectId,
        timerId: activeOccurrence.timerId,
        targetAtMs: activeOccurrence.targetAtMs,
      })
      return true
    },
    [
      acknowledgeCountUpsForProject,
      activeOccurrences,
      analyticsProperties,
      openTarget,
      unacknowledgeCountUpsForProject,
    ],
  )

  useEffect(() => {
    if (!hasHydrated) return
    const payload = parseCountUpNotificationHash(globalThis.location.hash)
    if (!payload || !handleNotificationAction(payload)) return
    globalThis.history.replaceState(null, "", `${globalThis.location.pathname}${globalThis.location.search}`)
  }, [handleNotificationAction, hasHydrated])

  useEffect(() => {
    if (!("serviceWorker" in navigator) || typeof navigator.serviceWorker.addEventListener !== "function") return
    const serviceWorker = navigator.serviceWorker

    const handleServiceWorkerMessage = (message: MessageEvent<unknown>) => {
      const payload = parseCountUpNotificationAction(message.data)
      if (!payload) return
      handleNotificationAction(payload)
    }

    serviceWorker.addEventListener("message", handleServiceWorkerMessage)
    return () => serviceWorker.removeEventListener("message", handleServiceWorkerMessage)
  }, [handleNotificationAction])

  return null
}
