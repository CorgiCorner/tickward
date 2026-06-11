import type { LocalProjectPayload, ProjectMeta } from "@/lib/project-model"
import type { Space, Timer } from "@/lib/types"

export const DEMO_PROJECT_ID = "demo_big_days"
export const DEMO_RESTORE_KEY = "demoBigDays2026"
export const DEMO_SHARE_ID = "share_lisbon_flight_2026"
export const DEMO_SHARED_TIMER_ID = "timer_lisbon_flight"

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
      id: "space_plans",
      name: "Plans",
      color: "#2563eb",
      createdAt: nowIso,
    },
    {
      id: "space_deadlines",
      name: "Deadlines",
      color: "#d97706",
      createdAt: nowIso,
    },
  ]

  const timers: Timer[] = [
    demoTimer({
      id: DEMO_SHARED_TIMER_ID,
      label: "Flight to Lisbon",
      description: "Bags by the door the night before. Passport in the front pocket this time.",
      targetDate: addDays(createdAt, 3, 6, 40),
      color: "#2563eb",
      spaceId: "space_plans",
      pinned: true,
      sharedAt: nowIso,
      shareId: DEMO_SHARE_ID,
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_marta_birthday",
      label: "Marta's birthday",
      description: "Order the cake by Tuesday. She noticed it was last-minute last year.",
      targetDate: addDays(createdAt, 6, 18),
      color: "#db2777",
      spaceId: "space_plans",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_lease_decision",
      label: "Lease renewal decision",
      description: "Compare a few places before it auto-renews. Email the landlord either way.",
      targetDate: addDays(createdAt, 9, 17),
      color: "#d97706",
      spaceId: "space_deadlines",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_stadium_gig",
      label: "Stadium gig with Ola",
      description: "Gates at six. Earplugs this time, no excuses.",
      targetDate: addDays(createdAt, 12, 18),
      color: "#7c3aed",
      spaceId: "space_plans",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_visa_window",
      label: "Visa appointment",
      description: "Print the confirmation and bring both photos. Get there 15 minutes early.",
      targetDate: addDays(createdAt, 15, 8, 30),
      color: "#dc2626",
      spaceId: "space_deadlines",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_race_day",
      label: "Half marathon",
      description: "Nothing new on race morning. Same shoes, same breakfast.",
      targetDate: addDays(createdAt, 20, 9),
      color: "#0d9488",
      spaceId: "space_plans",
      createdAt: nowIso,
    }),
  ]

  const project: ProjectMeta = {
    id: DEMO_PROJECT_ID,
    name: "Big days",
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
