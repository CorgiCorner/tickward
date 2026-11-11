// "Has this played today": the one record of which milestone moments already played on this
// device, shared by the card, the detail view and the dial. A moment is named by its surface,
// the timer and the milestone value (not its date), so an edit that arrives through sync does
// not play it again. Each surface plays it once per timer and value, as on iOS, where the
// detail celebration and the list row are separate moments.

import type { MilestoneOccurrence } from "@/lib/milestones"

export type MomentSurface = "card" | "detail" | "dial"

/** Remembers which moments already played. */
export type MomentLedger = Readonly<{
  /** Whether the moment already played (or is playing). */
  has: (key: string) => boolean
  /** True the first time `key` is claimed; every later claim gets false. */
  claim: (key: string, nowMs: number) => boolean
}>

export const MOMENT_LEDGER_STORAGE_KEY = "tickward:milestone-moments"
/** A milestone is only celebrated on its own day, so old entries can go. */
const LEDGER_RETENTION_MS = 3 * 86_400_000

export function momentKey(
  surface: MomentSurface,
  timerId: string,
  milestone: Pick<MilestoneOccurrence, "unit" | "count">,
) {
  return `${surface}|${timerId}|${milestone.unit}|${milestone.count}`
}

function readLedger(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(MOMENT_LEDGER_STORAGE_KEY) ?? "{}")
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    )
  } catch {
    return {}
  }
}

/** The ledger kept on this device. Without storage a moment still plays once per page load. */
export function createLocalMomentLedger(): MomentLedger {
  const session = new Set<string>()
  return {
    has: (key) => session.has(key) || readLedger()[key] !== undefined,
    claim(key, nowMs) {
      if (session.has(key)) return false
      session.add(key)
      const entries = readLedger()
      if (entries[key] !== undefined) return false
      const kept = Object.fromEntries(
        Object.entries(entries).filter(([, playedAt]) => nowMs - playedAt < LEDGER_RETENTION_MS),
      )
      kept[key] = nowMs
      try {
        globalThis.localStorage?.setItem(MOMENT_LEDGER_STORAGE_KEY, JSON.stringify(kept))
      } catch {
        // Storage can be full or blocked; the session set above still stops a replay.
      }
      return true
    },
  }
}

/** A ledger that forgets on reload, for stories and tests. */
export function createMemoryMomentLedger(): MomentLedger {
  const played = new Set<string>()
  return {
    has: (key) => played.has(key),
    claim(key) {
      if (played.has(key)) return false
      played.add(key)
      return true
    },
  }
}

export const localMomentLedger = createLocalMomentLedger()
