import type { Timer } from "@/lib/types"

// Demo timers for the dial stories and tests: one person's week, read on Tue, Nov 10, 2026 at
// 13:00 in Warsaw. Not imported by the app.

export const DIAL_DEMO_ZONE = "Europe/Warsaw"
export const dialDemoNowMs = Date.UTC(2026, 10, 10, 12, 0, 0)

const HOUR = 3_600_000
const DAY = 24 * HOUR
const created = new Date(dialDemoNowMs - 40 * DAY).toISOString()

function warsaw(month: number, day: number, hour: number, minute: number, year = 2026) {
  // November is CET (UTC+1); dates from April to October are CEST (UTC+2).
  const offset = month >= 3 && month <= 9 ? 2 : 1
  return new Date(Date.UTC(year, month, day, hour - offset, minute)).toISOString()
}

export const dialDemoTimers = {
  train: {
    id: "train",
    label: "Train to Gdansk",
    targetDate: warsaw(10, 11, 16, 0),
    timezone: DIAL_DEMO_ZONE,
    createdAt: created,
    color: "#2563eb",
    pinned: true,
    description: "Tickets are in the wallet. Pack the charger before leaving.",
    reminders: [{ offsetMinutes: 1440 }],
  },
  herbs: {
    id: "herbs",
    label: "Water balcony herbs",
    targetDate: warsaw(9, 1, 9, 45),
    timezone: DIAL_DEMO_ZONE,
    createdAt: created,
    color: "#0d9488",
    description: "Do it before the afternoon sun hits the pots.",
    recurrence: { type: "daily", enabled: true },
  },
  sunday: {
    id: "sunday",
    label: "Sunday reset",
    targetDate: warsaw(9, 3, 10, 30),
    timezone: DIAL_DEMO_ZONE,
    createdAt: created,
    color: "#d97706",
    description: "Laundry, clean the fridge shelf, and pick meals for the first half of the week.",
    recurrence: { type: "weekly", enabled: true },
    reminders: [{ offsetMinutes: 60 }],
  },
  marta: {
    id: "marta",
    label: "Marta's birthday",
    targetDate: warsaw(10, 16, 18, 0),
    timezone: DIAL_DEMO_ZONE,
    createdAt: created,
    color: "#7c3aed",
    description: "Order the cake by Tuesday and hide the candles before she visits.",
    reminders: [{ offsetMinutes: 1440 }],
  },
  lease: {
    id: "lease",
    label: "Lease renewal call",
    targetDate: warsaw(10, 19, 13, 0),
    timezone: DIAL_DEMO_ZONE,
    createdAt: created,
    color: "#dc2626",
    reminders: [{ offsetMinutes: 10080 }, { offsetMinutes: 60 }],
  },
  met: {
    id: "met",
    label: "Since we met",
    // 1,300 days and 12 minutes before the demo instant, at the same wall-clock time.
    targetDate: warsaw(3, 20, 12, 48, 2023),
    timezone: DIAL_DEMO_ZONE,
    createdAt: warsaw(3, 20, 12, 48, 2023),
    color: "#7c3aed",
    mode: "since",
    description: "The evening at the lake.",
    milestones: { rules: [{ unit: "days", every: 100 }] },
  },
  parcel: {
    id: "parcel",
    label: "Parcel picked up",
    targetDate: warsaw(10, 9, 22, 10),
    timezone: DIAL_DEMO_ZONE,
    createdAt: warsaw(10, 9, 22, 10),
    color: "#16a34a",
    mode: "since",
    description: "Collected the lamp from the pickup point on the way home.",
    milestones: { rules: [{ unit: "days", at: [1, 3, 7] }] },
  },
  dentist: {
    id: "dentist",
    label: "Dentist booked",
    targetDate: warsaw(10, 7, 18, 10),
    timezone: DIAL_DEMO_ZONE,
    createdAt: warsaw(10, 7, 18, 10),
    color: "#64748b",
    mode: "since",
    milestones: { rules: [{ unit: "days", at: [1, 3, 7] }] },
  },
} satisfies Record<string, Timer>

export const dialDemoTimerList: Timer[] = Object.values(dialDemoTimers)

/** A countdown far enough out that its number needs a thousands separator. */
export const dialLongTimer: Timer = {
  id: "retire",
  label: "Last day at the office",
  targetDate: new Date(dialDemoNowMs + 1300 * DAY + 5 * HOUR).toISOString(),
  timezone: DIAL_DEMO_ZONE,
  createdAt: created,
  color: "#0891b2",
  pinned: true,
  description: "Then a long walk and no alarm clock.",
}
