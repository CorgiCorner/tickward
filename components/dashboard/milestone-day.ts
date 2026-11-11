import { lastMilestoneBefore, type MilestoneOccurrence, type MilestoneRule } from "@/lib/milestones"

// ---- The milestone day ---------------------------------------------------------
//
// One rule for every surface that celebrates a milestone (the card, the compact
// card, the detail view and the dial), the same one the iPhone app uses: a
// milestone stays "today" for the 24 hours after the instant it is reached,
// whatever the calendar day on the timer's wall clock.

/** How long a reached milestone is celebrated. */
export const MILESTONE_DAY_MS = 86_400_000

/** True from the instant a milestone is reached until 24 hours later (exclusive). */
export function isMilestoneDay(milestoneAtMs: number, nowMs: number): boolean {
  const sinceMs = nowMs - milestoneAtMs
  return sinceMs >= 0 && sinceMs < MILESTONE_DAY_MS
}

/** The latest milestone at or before `nowMs`, when it was reached in the last 24 hours. */
export function reachedMilestone(
  anchorIso: string,
  rules: MilestoneRule[],
  timezone: string,
  nowMs: number,
): MilestoneOccurrence | null {
  const anchorMs = new Date(anchorIso).getTime()
  if (rules.length === 0 || !Number.isFinite(anchorMs) || anchorMs > nowMs) return null
  const last = lastMilestoneBefore(anchorIso, rules, timezone, nowMs)
  return last && isMilestoneDay(new Date(last.at).getTime(), nowMs) ? last : null
}
