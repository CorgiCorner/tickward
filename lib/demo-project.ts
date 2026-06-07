import type { LocalProjectPayload, ProjectMeta } from "@/lib/project-model"
import type { Space, Timer } from "@/lib/types"

export const DEMO_PROJECT_ID = "demo_watchlist_planner"
export const DEMO_RESTORE_KEY = "demoWatchlist2026"
export const DEMO_SHARE_ID = "share_movie_night_2026"
export const DEMO_SHARED_TIMER_ID = "timer_movie_night"

type DemoProjectSeed = {
  payload: LocalProjectPayload
  project: ProjectMeta
}

function addDays(base: Date, days: number, hour: number, minute = 0) {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + days)
  next.setUTCHours(hour, minute, 0, 0)
  return next.toISOString()
}

function demoTimer(args: {
  color: string
  createdAt: string
  description: string
  id: string
  label: string
  pinned?: boolean
  sharedAt?: string
  shareId?: string
  spaceId?: string
  targetDate: string
}): Timer {
  const sharedFields =
    args.sharedAt && args.shareId
      ? {
          sharedAt: args.sharedAt,
          sourceShareId: args.shareId,
        }
      : {}

  return {
    id: args.id,
    label: args.label,
    targetDate: args.targetDate,
    timezone: "Europe/Warsaw",
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    color: args.color,
    description: args.description,
    notify: true,
    pinned: args.pinned,
    spaceId: args.spaceId,
    ...sharedFields,
    notification: {
      enabled: true,
    },
  }
}

export function createDemoProject(baseDate = new Date()): DemoProjectSeed {
  const createdAt = new Date(baseDate)
  createdAt.setUTCMinutes(0, 0, 0)
  const nowIso = createdAt.toISOString()

  const spaces: Space[] = [
    {
      id: "space_watchlist",
      name: "Watchlist",
      color: "#2563eb",
      createdAt: nowIso,
    },
    {
      id: "space_subscriptions",
      name: "Subscriptions",
      color: "#16a34a",
      createdAt: nowIso,
    },
  ]

  const timers: Timer[] = [
    demoTimer({
      id: DEMO_SHARED_TIMER_ID,
      label: "Movie night with friends",
      description: "Snacks, blankets, 4K cut. Start before everyone gets restless.",
      targetDate: addDays(createdAt, 2, 19, 30),
      color: "#2563eb",
      spaceId: "space_watchlist",
      pinned: true,
      sharedAt: nowIso,
      shareId: DEMO_SHARE_ID,
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_season_finale",
      label: "Season finale before spoilers",
      description: "Watch tonight before the group chat ruins it.",
      targetDate: addDays(createdAt, 4, 20),
      color: "#7c3aed",
      spaceId: "space_watchlist",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_new_episode",
      label: "Morning episode drop",
      description: "Coffee first, episode second, messages later.",
      targetDate: addDays(createdAt, 7, 9),
      color: "#db2777",
      spaceId: "space_watchlist",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_streaming_renewal",
      label: "Streaming bill check",
      description: "Check this month's watch history before the card gets charged.",
      targetDate: addDays(createdAt, 10, 8),
      color: "#16a34a",
      spaceId: "space_subscriptions",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_trial_window",
      label: "Trial decision",
      description: "Keep it only if it earned a spot in the rotation.",
      targetDate: addDays(createdAt, 13, 18),
      color: "#f97316",
      spaceId: "space_subscriptions",
      createdAt: nowIso,
    }),
  ]

  const project: ProjectMeta = {
    id: DEMO_PROJECT_ID,
    name: "My Watchlist & Subscriptions",
    restoreKey: DEMO_RESTORE_KEY,
    color: "#2563eb",
    createdAt: nowIso,
    updatedAt: nowIso,
    hasUnsyncedChanges: false,
    timerCount: timers.length,
    spaceCount: spaces.length,
  }

  return {
    project,
    payload: {
      timers,
      spaces,
      activeSpaceId: null,
      sortMode: "soonest",
      updatedAt: nowIso,
    },
  }
}
