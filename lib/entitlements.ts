// Plan entitlements.
//
// Limits used to be scattered as standalone constants (MAX_TIMERS, MAX_PROJECTS,
// MAX_SPACES, a hardcoded 50-timer snapshot cap). They are unified here as a
// per-plan entitlement set so future authenticated plans can raise the caps
// without touching callers. This module is pure and client-safe (no
// "server-only"); both UI and server code read from it.

import type { Actor, UserRef } from "@/lib/contracts"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"

export const PLAN_IDS = ["anonymous", "free"] as const
export type PlanId = (typeof PLAN_IDS)[number]

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_IDS.includes(value as PlanId)
}

export type Entitlements = {
  plan: PlanId
  maxTimers: number
  maxTimersPerSpace: number
  maxProjects: number
  maxSpaces: number
  maxSnapshotTimers: number
}

export type EntitlementsTable = Record<PlanId, Entitlements>

type PlanEntitlementRelationships = Pick<Entitlements, "maxSnapshotTimers" | "maxTimers" | "maxTimersPerSpace">

export const PUBLIC_LIMIT_MAX = 1_000

export function planEntitlementConsistencyError(values: PlanEntitlementRelationships): MessageKey | null {
  if (values.maxSnapshotTimers < values.maxTimers) return "errors.snapshotTimerLimitBelowTotal"
  if (values.maxTimersPerSpace > values.maxTimers) return "errors.spaceTimerLimitAboveTotal"
  return null
}

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

function doubled(value: number) {
  return Math.min(PUBLIC_LIMIT_MAX, value * 2)
}

export function defaultEntitlementsTable(): EntitlementsTable {
  const anonymous = getAnonymousEntitlements()
  return {
    anonymous,
    free: {
      plan: "free",
      maxTimers: doubled(anonymous.maxTimers),
      maxTimersPerSpace: doubled(anonymous.maxTimersPerSpace),
      maxProjects: doubled(anonymous.maxProjects),
      maxSpaces: doubled(anonymous.maxSpaces),
      maxSnapshotTimers: anonymous.maxSnapshotTimers,
    },
  }
}

let activeTable: EntitlementsTable | null = null
let activePlan: PlanId = "anonymous"
const AUTHENTICATED_PLAN_BY_ROLE: Readonly<Record<NonNullable<UserRef["role"]>, PlanId>> = {
  admin: "free",
  user: "free",
}

export function setEntitlementsTable(table: EntitlementsTable) {
  if (typeof window === "undefined") return
  activeTable = {
    anonymous: { ...table.anonymous },
    free: { ...table.free },
  }
}

export function setActiveClientPlan(plan: PlanId) {
  if (typeof window === "undefined") return
  activePlan = plan
}

export function planForUser(user: UserRef): PlanId {
  return AUTHENTICATED_PLAN_BY_ROLE[user.role ?? "user"]
}

/** Resolve limits from an explicit actor or the active client plan. */
export function getEntitlements(actor?: Actor | null): Entitlements {
  const table = typeof window !== "undefined" && activeTable ? activeTable : defaultEntitlementsTable()
  if (actor?.kind === "user") return table[planForUser(actor.user)]
  if (actor?.kind === "anonymous") return table.anonymous
  return table[typeof window !== "undefined" ? activePlan : "anonymous"]
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
  return withAnonymousUpsell(formatMessage("timer.limit.total", { max: entitlements.maxTimers }), entitlements)
}

/** User-facing message shown when the active per-space timer limit is reached. */
export function timerSpaceLimitMessage(entitlements: Entitlements): string {
  return withAnonymousUpsell(formatMessage("timer.limit.space", { max: entitlements.maxTimersPerSpace }), entitlements)
}

/** User-facing message shown when the space limit is reached. */
export function spaceLimitMessage(entitlements: Entitlements): string {
  return withAnonymousUpsell(formatMessage("space.limit.total", { max: entitlements.maxSpaces }), entitlements)
}

export function projectLimitMessage(entitlements: Entitlements): string {
  return withAnonymousUpsell(formatMessage("project.limit.total", { max: entitlements.maxProjects }), entitlements)
}

function withAnonymousUpsell(message: string, entitlements: Entitlements) {
  return entitlements.plan === "anonymous" ? `${message} ${formatMessage("limit.upsell")}` : message
}
