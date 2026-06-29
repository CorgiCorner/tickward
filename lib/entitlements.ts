// Plan entitlements.
//
// Limits used to be scattered as standalone constants (MAX_TIMERS, MAX_PROJECTS,
// MAX_SPACES, a hardcoded 50-timer snapshot cap). They are unified here as a
// per-plan entitlement set so future authenticated plans can raise the caps
// without touching callers. This module is pure and client-safe (no
// "server-only"); both UI and server code read from it.

import type { Actor } from "@/lib/contracts"
import { formatMessage } from "@/lib/i18n/messages"

export type PlanId = "anonymous"

export type Entitlements = {
  plan: PlanId
  maxTimers: number
  maxTimersPerSpace: number
  maxProjects: number
  maxSpaces: number
  maxSnapshotTimers: number
}

const PUBLIC_LIMIT_MAX = 1_000

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PUBLIC_LIMIT_MAX) return fallback
  return parsed
}

/**
 * The only plan that exists today. Every actor — authenticated or not — maps to
 * these limits until paid/auth plans land, at which point getEntitlements will
 * branch on the actor.
 */
export const ANONYMOUS_ENTITLEMENTS: Entitlements = {
  plan: "anonymous",
  maxTimers: 20,
  maxTimersPerSpace: 20,
  maxProjects: 10,
  maxSpaces: 2,
  maxSnapshotTimers: 50,
}

export function getAnonymousEntitlements(): Entitlements {
  return {
    ...ANONYMOUS_ENTITLEMENTS,
    maxTimers: readPositiveInt(process.env.NEXT_PUBLIC_TICKWARD_MAX_TIMERS, ANONYMOUS_ENTITLEMENTS.maxTimers),
    maxTimersPerSpace: readPositiveInt(
      process.env.NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE,
      ANONYMOUS_ENTITLEMENTS.maxTimersPerSpace,
    ),
    maxProjects: readPositiveInt(process.env.NEXT_PUBLIC_TICKWARD_MAX_PROJECTS, ANONYMOUS_ENTITLEMENTS.maxProjects),
    maxSpaces: readPositiveInt(process.env.NEXT_PUBLIC_TICKWARD_MAX_SPACES, ANONYMOUS_ENTITLEMENTS.maxSpaces),
  }
}

/**
 * Resolve the entitlements for an actor. Today every actor — including none —
 * maps to the anonymous plan; future plans will branch on the actor here.
 */
export function getEntitlements(actor?: Actor | null): Entitlements {
  if (actor?.kind === "user") return getAnonymousEntitlements()
  return getAnonymousEntitlements()
}

/** Whether another timer may be created given the current count. */
export function canCreateTimer(timerCount: number, entitlements: Entitlements): boolean {
  return timerCount < entitlements.maxTimers
}

/** Whether another active timer may be created in a target space. */
export function canCreateTimerInSpace(
  totalTimerCount: number,
  spaceTimerCount: number,
  entitlements: Entitlements,
): boolean {
  return canCreateTimer(totalTimerCount, entitlements) && spaceTimerCount < entitlements.maxTimersPerSpace
}

/** User-facing message shown when the active timer limit is reached. */
export function timerLimitMessage(entitlements: Entitlements): string {
  return formatMessage("timer.limit.total", { max: entitlements.maxTimers })
}

/** User-facing message shown when the active per-space timer limit is reached. */
export function timerSpaceLimitMessage(entitlements: Entitlements): string {
  return formatMessage("timer.limit.space", { max: entitlements.maxTimersPerSpace })
}

/** User-facing message shown when the space limit is reached. */
export function spaceLimitMessage(entitlements: Entitlements): string {
  return formatMessage("space.limit.total", { max: entitlements.maxSpaces })
}
