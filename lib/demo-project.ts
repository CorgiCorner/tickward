import type { LocalProjectPayload, ProjectMeta } from "@/lib/project-model"
import type { Space, Timer } from "@/lib/types"

export const DEMO_PROJECT_ID = "demo_big_days"
export const DEMO_RESTORE_KEY = "demoBigDays2026"
export const DEMO_SHARE_ID = "share_train_gdansk_2026"
export const DEMO_SHARED_TIMER_ID = "timer_train_gdansk"

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
  notify?: boolean
  pinned?: boolean
  recurrence?: NonNullable<Timer["recurrence"]>
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
    notify: args.notify ?? true,
    pinned: args.pinned,
    recurrence: args.recurrence,
    spaceId: args.spaceId,
    ...sharedFields,
    notification: {
      enabled: args.notify ?? true,
    },
  }
}

export function createDemoProject(baseDate = new Date()): DemoProjectSeed {
  const createdAt = new Date(baseDate)
  createdAt.setUTCMinutes(0, 0, 0)
  const nowIso = createdAt.toISOString()

  const spaces: Space[] = [
    {
      id: "space_doing",
      name: "Coming up",
      color: "#2563eb",
      createdAt: nowIso,
    },
    {
      id: "space_done",
      name: "Done",
      color: "#16a34a",
      createdAt: nowIso,
    },
  ]

  const timers: Timer[] = [
    demoTimer({
      id: DEMO_SHARED_TIMER_ID,
      label: "Train to Gdansk",
      description: "Tickets are in the wallet. Pack the charger before leaving.",
      targetDate: addDays(createdAt, 1, 15),
      color: "#2563eb",
      spaceId: "space_doing",
      pinned: true,
      sharedAt: nowIso,
      shareId: DEMO_SHARE_ID,
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_balcony_herbs",
      label: "Water balcony herbs",
      description: "Do it before the afternoon sun hits the pots.",
      targetDate: addDays(createdAt, 1, 8, 45),
      color: "#0d9488",
      spaceId: "space_doing",
      recurrence: { enabled: true, type: "daily" },
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_sunday_reset",
      label: "Sunday reset",
      description: "Laundry, clean the fridge shelf, and pick meals for the first half of the week.",
      targetDate: addDays(createdAt, 4, 9, 30),
      color: "#d97706",
      spaceId: "space_doing",
      recurrence: { enabled: true, type: "weekly" },
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_marta_birthday",
      label: "Marta's birthday",
      description: "Order the cake by Tuesday and hide the candles before she visits.",
      targetDate: addDays(createdAt, 6, 17),
      color: "#7c3aed",
      spaceId: "space_doing",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_lease_renewal",
      label: "Lease renewal call",
      description: "Call the landlord before the renewal window closes.",
      targetDate: addDays(createdAt, 9, 12),
      color: "#dc2626",
      spaceId: "space_doing",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_parcel_picked_up",
      label: "Parcel picked up",
      description: "Collected the lamp from the pickup point on the way home.",
      targetDate: addDays(createdAt, -1, 20),
      color: "#16a34a",
      spaceId: "space_done",
      notify: false,
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_dentist_booked",
      label: "Dentist booked",
      description: "Appointment confirmed; reminder can stay off now.",
      targetDate: addDays(createdAt, -3, 16),
      color: "#64748b",
      spaceId: "space_done",
      notify: false,
      createdAt: nowIso,
    }),
  ]

  const project: ProjectMeta = {
    id: DEMO_PROJECT_ID,
    name: "Home week",
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
