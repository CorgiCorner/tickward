import "server-only"

import { unstable_cache } from "next/cache"
import { headers } from "next/headers"

import { getCurrentActor } from "@/lib/actor.server"
import type { Actor } from "@/lib/contracts"
import { getPrismaClient } from "@/lib/db/prisma.server"
import {
  PLAN_IDS,
  PUBLIC_LIMIT_MAX,
  defaultEntitlementsTable,
  planForUser,
  type Entitlements,
  type EntitlementsTable,
  type PlanId,
} from "@/lib/entitlements"

type EntitlementRow = {
  plan: string
  maxTimers: number
  maxTimersPerSpace: number
  maxProjects: number
  maxSpaces: number
  maxSnapshotTimers: number
}

function clampLimit(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(PUBLIC_LIMIT_MAX, Math.max(1, Math.trunc(value)))
}

function mergeRow(table: EntitlementsTable, row: EntitlementRow) {
  if (!PLAN_IDS.includes(row.plan as PlanId)) return
  const plan = row.plan as PlanId
  const fallback = table[plan]
  table[plan] = {
    plan,
    maxTimers: clampLimit(row.maxTimers, fallback.maxTimers),
    maxTimersPerSpace: clampLimit(row.maxTimersPerSpace, fallback.maxTimersPerSpace),
    maxProjects: clampLimit(row.maxProjects, fallback.maxProjects),
    maxSpaces: clampLimit(row.maxSpaces, fallback.maxSpaces),
    maxSnapshotTimers: clampLimit(row.maxSnapshotTimers, fallback.maxSnapshotTimers),
  }
}

async function loadEntitlementsTable(): Promise<EntitlementsTable> {
  const table = defaultEntitlementsTable()
  const prisma = getPrismaClient()
  if (!prisma) return table

  const rows = await prisma.planEntitlements.findMany({
    where: { plan: { in: [...PLAN_IDS] } },
    select: {
      plan: true,
      maxTimers: true,
      maxTimersPerSpace: true,
      maxProjects: true,
      maxSpaces: true,
      maxSnapshotTimers: true,
    },
  })
  for (const row of rows) mergeRow(table, row)
  return table
}

export const getEntitlementsTable = unstable_cache(loadEntitlementsTable, ["plan-entitlements"], {
  tags: ["entitlements"],
})

export async function getEntitlementsForActor(actor: Actor | null): Promise<Entitlements> {
  const table = await getEntitlementsTable()
  return actor?.kind === "user" ? table[planForUser(actor.user)] : table.anonymous
}

export async function getActivePlanForCurrentRequest(): Promise<PlanId> {
  try {
    const incomingHeaders = await headers()
    const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
    const host = incomingHeaders.get("host") ?? "localhost"
    const actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}/`, { headers: new Headers(incomingHeaders) }),
    })
    return actor.kind === "user" ? planForUser(actor.user) : "anonymous"
  } catch {
    return "anonymous"
  }
}
