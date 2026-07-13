"use server"

import { headers } from "next/headers"
import { updateTag } from "next/cache"
import { notFound } from "next/navigation"

import { getCurrentActor } from "@/lib/actor.server"
import { actorRole } from "@/lib/auth/permissions"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import {
  isPlanId,
  planEntitlementConsistencyError,
  PUBLIC_LIMIT_MAX,
  type Entitlements,
  type PlanId,
} from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"

export type PlanEntitlementValues = Omit<Entitlements, "plan">

const LIMIT_KEYS = ["maxTimers", "maxTimersPerSpace", "maxProjects", "maxSpaces", "maxSnapshotTimers"] as const

async function requireAdminActor() {
  const incomingHeaders = await headers()
  const requestHeaders = new Headers(incomingHeaders)
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"

  try {
    const actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}/admin`, { headers: requestHeaders }),
    })
    if (actor.kind === "user" && actorRole(actor) === "admin") return actor
  } catch {}

  notFound()
}

function validateValues(values: PlanEntitlementValues): PlanEntitlementValues {
  if (!values || typeof values !== "object") throw new Error(formatMessage("errors.invalidPlanEntitlements"))
  const candidate = values as Record<string, unknown>
  if (Object.keys(candidate).length !== LIMIT_KEYS.length || LIMIT_KEYS.some((key) => !(key in candidate))) {
    throw new Error(formatMessage("errors.invalidPlanEntitlements"))
  }

  for (const key of LIMIT_KEYS) {
    const value = candidate[key]
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > PUBLIC_LIMIT_MAX) {
      throw new Error(formatMessage("errors.invalidPlanEntitlements"))
    }
  }
  const validated = Object.fromEntries(LIMIT_KEYS.map((key) => [key, candidate[key]])) as PlanEntitlementValues
  const consistencyError = planEntitlementConsistencyError(validated)
  if (consistencyError) throw new Error(formatMessage(consistencyError))
  return validated
}

export async function updatePlanEntitlements(plan: PlanId, values: PlanEntitlementValues) {
  const actor = await requireAdminActor()
  if (!isPlanId(plan)) throw new Error(formatMessage("errors.invalidPlanEntitlements"))
  const validated = validateValues(values)
  const prisma = requirePrismaClient()

  await prisma.$transaction(async (tx) => {
    await tx.planEntitlements.upsert({
      where: { plan },
      create: { plan, ...validated },
      update: validated,
    })
    await tx.auditLog.create({
      data: {
        action: "admin.plan_entitlements.updated",
        actorEmail: actor.user.email,
        actorId: actor.user.id,
        targetId: plan,
        targetType: "plan_entitlements",
        metadata: validated,
      },
    })
  })
  updateTag("entitlements")
}
