import "server-only"

import type { PrismaClient } from "@/lib/generated/prisma/client"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import { optionalServerEnv } from "@/lib/env.server"

const OWNERLESS_PROJECT_GC_BATCH_SIZE = 100
const DAY_MS = 24 * 60 * 60_000

export type OwnerlessProjectGcResult = {
  deletedProjects: number
  deletedShares: number
}

function ownerlessProjectGcPrisma(): PrismaClient {
  return requirePrismaClient()
}

function ownerlessProjectRetentionDays() {
  const raw = optionalServerEnv("TICKWARD_OWNERLESS_PROJECT_RETENTION_DAYS")
  if (!raw || !/^\d+$/.test(raw)) return null

  const days = Number.parseInt(raw, 10)
  return Number.isSafeInteger(days) && days > 0 ? days : null
}

export async function collectOwnerlessProjects(now = new Date()): Promise<OwnerlessProjectGcResult> {
  const retentionDays = ownerlessProjectRetentionDays()
  if (!retentionDays) return { deletedProjects: 0, deletedShares: 0 }

  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS)
  const result = await ownerlessProjectGcPrisma().$transaction(async (tx) => {
    const projects = await tx.project.findMany({
      where: {
        ownerId: null,
        updatedAt: { lt: cutoff },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: OWNERLESS_PROJECT_GC_BATCH_SIZE,
    })
    const projectIds = projects.map((project) => project.id)
    if (projectIds.length === 0) return { deletedProjects: 0, deletedShares: 0 }

    // Shares reference projects with onDelete: SetNull (unlike timers, spaces,
    // and access tokens, which cascade from the project delete), so they must
    // be deleted explicitly. Re-apply the ownerless+stale predicate through the
    // relation instead of trusting the pre-selected id list: a project claimed
    // between the select and this delete keeps its shares.
    const shares = await tx.share.deleteMany({
      where: {
        projectId: { in: projectIds },
        project: { is: { ownerId: null, updatedAt: { lt: cutoff } } },
      },
    })
    const deletedProjects = await tx.project.deleteMany({
      where: {
        id: { in: projectIds },
        ownerId: null,
        updatedAt: { lt: cutoff },
      },
    })
    if (deletedProjects.count !== projectIds.length) {
      // A selected project stopped matching mid-transaction (e.g. it was
      // claimed). Roll back so its already-deleted shares are restored; the
      // next scheduler tick retries the remaining candidates.
      throw new Error(
        `Ownerless project GC aborted: expected to delete ${projectIds.length} projects, deleted ${deletedProjects.count}.`,
      )
    }

    return { deletedProjects: deletedProjects.count, deletedShares: shares.count }
  })

  console.info("[tickward] scheduler.tick ownerlessProjects", {
    deletedProjects: result.deletedProjects,
    deletedShares: result.deletedShares,
  })
  return result
}
