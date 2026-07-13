import "server-only"

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import { overLimitProjectRetentionDays } from "@/lib/data-retention.server"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import { getEntitlementsTable } from "@/lib/entitlements.server"
import { formatMessage } from "@/lib/i18n/messages"
import { readOnlyProjectIds, type ProjectMembership } from "@/lib/project-lock"
import { getResendConfig } from "@/lib/private-config.server"
import { getSiteOrigin } from "@/lib/site-config"

const OVER_LIMIT_PROJECT_GC_BATCH_SIZE = 100
const DAY_MS = 24 * 60 * 60_000

export type OverLimitProjectGcResult = {
  stamped: number
  unstamped: number
  deleted: number
  alertsSent: number
}

function overLimitProjectGcPrisma(): PrismaClient {
  return requirePrismaClient()
}

function selfHostingDocsUrl(): string {
  return `${getSiteOrigin()}/docs/guides/self-hosting`
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function overLimitAlertHtml(args: { projectName: string; purgeAt: Date; selfHostingUrl: string }): string {
  const name = escapeHtml(args.projectName)
  const purgeDate = escapeHtml(args.purgeAt.toDateString())
  const docsUrl = escapeHtml(args.selfHostingUrl)

  const linkText = escapeHtml(formatMessage("email.overLimitAlert.selfHostLinkText"))
  const selfHostLink = `<a href="${docsUrl}">${linkText}</a>`
  const boldName = `<strong>${name}</strong>`
  const boldPurgeDate = `<strong>${purgeDate}</strong>`

  return [
    `<p>${formatMessage("email.overLimitAlert.intro", { name: boldName })}</p>`,
    `<p>${formatMessage("email.overLimitAlert.deadline", { purgeDate: boldPurgeDate })}</p>`,
    `<p>${formatMessage("email.overLimitAlert.waysOut")}</p>`,
    `<ul>`,
    `<li>${formatMessage("email.overLimitAlert.optionDelete")}</li>`,
    `<li>${formatMessage("email.overLimitAlert.optionSelfHost", { selfHostLink })}</li>`,
    `</ul>`,
  ].join("")
}

async function sendOverLimitAlert(args: { to: string; projectName: string; purgeAt: Date }): Promise<boolean> {
  const config = getResendConfig()
  if (!config) return false

  const docsUrl = selfHostingDocsUrl()

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "tickward/1.0",
      },
      body: JSON.stringify({
        from: config.from,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        to: [args.to],
        subject: formatMessage("email.overLimitAlert.subject", { name: args.projectName }),
        html: overLimitAlertHtml({ projectName: args.projectName, purgeAt: args.purgeAt, selfHostingUrl: docsUrl }),
      }),
    })
    if (!res.ok) {
      console.error("[tickward] scheduler.tick overLimitProjects alert send failed", {
        status: res.status,
        projectName: args.projectName,
      })
      return false
    }
    return true
  } catch (error) {
    console.error("[tickward] scheduler.tick overLimitProjects alert send error", {
      error,
      projectName: args.projectName,
    })
    return false
  }
}

type OwnerSweepOutcome = {
  stamped: number
  unstamped: number
  deleted: number
  alertRecipients: string[]
}

// Runs the stamp/clear/delete sweep for one owner inside the caller's
// transaction, so the re-check predicates stay atomic with the writes.
async function sweepOwnerProjects(
  tx: Prisma.TransactionClient,
  args: { ownerId: string; maxProjects: number; cutoff: Date; now: Date },
): Promise<OwnerSweepOutcome> {
  const { ownerId, maxProjects, cutoff, now } = args

  // Load all memberships for this owner
  const memberRows = await tx.project.findMany({
    where: { ownerId },
    select: { id: true, claimedAt: true, createdAt: true },
  })

  const memberships: ProjectMembership[] = memberRows.map((p) => ({
    id: p.id,
    claimedAt: p.claimedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }))

  const readOnlyIds = readOnlyProjectIds(memberships, maxProjects)

  // Separate currently-stamped vs unstamped rows
  const allProjects = await tx.project.findMany({
    where: { ownerId },
    select: { id: true, name: true, overLimitSince: true },
  })

  const toStamp: Array<{ id: string; name: string }> = []
  const toClearStamp: string[] = []
  const toDelete: string[] = []

  for (const project of allProjects) {
    const isReadOnly = readOnlyIds.has(project.id)

    if (!isReadOnly) {
      // No longer read-only → clear the stamp
      if (project.overLimitSince) toClearStamp.push(project.id)
    } else if (!project.overLimitSince) {
      // null → set: fresh stamp
      toStamp.push({ id: project.id, name: project.name })
    } else if (project.overLimitSince < cutoff) {
      // Still read-only + stamp is older than retention → delete
      toDelete.push(project.id)
    }
    // else: already stamped but not yet past retention → nothing to do
  }

  // Stamp newly read-only projects
  if (toStamp.length > 0) {
    await tx.project.updateMany({
      where: { id: { in: toStamp.map((p) => p.id) }, overLimitSince: null },
      data: { overLimitSince: now },
    })
  }

  // Clear stamps on projects no longer read-only
  if (toClearStamp.length > 0) {
    await tx.project.updateMany({
      where: { id: { in: toClearStamp } },
      data: { overLimitSince: null },
    })
  }

  // Delete projects past retention. Re-check predicate in the transaction:
  // project must still be read-only and stamp still older than cutoff.
  let deletedCount = 0
  if (toDelete.length > 0) {
    // Shares reference projects with onDelete: SetNull — delete explicitly
    // with the same re-check predicate through the relation.
    await tx.share.deleteMany({
      where: {
        projectId: { in: toDelete },
        project: {
          is: {
            ownerId,
            overLimitSince: { lt: cutoff, not: null },
          },
        },
      },
    })

    const deleteResult = await tx.project.deleteMany({
      where: {
        id: { in: toDelete },
        ownerId,
        overLimitSince: { lt: cutoff, not: null },
      },
    })
    deletedCount = deleteResult.count
  }

  return {
    stamped: toStamp.length,
    unstamped: toClearStamp.length,
    deleted: deletedCount,
    // Alert only for freshly stamped projects; we need owner email for that.
    // Collect project names for alert — owner email resolved outside tx.
    alertRecipients: toStamp.map((p) => p.name),
  }
}

// Sends alert emails for freshly stamped projects (outside the transaction).
// Returns the number of alerts actually sent.
async function sendOwnerOverLimitAlerts(
  prisma: PrismaClient,
  args: { ownerId: string; projectNames: string[]; purgeAt: Date },
): Promise<number> {
  if (args.projectNames.length === 0) return 0

  // Look up owner email
  const owner = await prisma.user.findUnique({
    where: { id: args.ownerId },
    select: { email: true },
  })
  const ownerEmail = owner?.email
  if (!ownerEmail) return 0

  let alertsSent = 0
  for (const projectName of args.projectNames) {
    const sent = await sendOverLimitAlert({ to: ownerEmail, projectName, purgeAt: args.purgeAt })
    if (sent) alertsSent++
  }
  return alertsSent
}

export async function sweepOverLimitProjects(now = new Date()): Promise<OverLimitProjectGcResult> {
  const retentionDays = overLimitProjectRetentionDays()
  if (!retentionDays) return { stamped: 0, unstamped: 0, deleted: 0, alertsSent: 0 }

  // All authenticated users are currently on free. When more authenticated
  // plans exist, group by the minimum account cap and re-check each owner via
  // planForUser before stamping or deleting their over-limit projects.
  const maxProjects = (await getEntitlementsTable()).free.maxProjects
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS)

  let totalStamped = 0
  let totalUnstamped = 0
  let totalDeleted = 0
  let totalAlertsSent = 0

  const prisma = overLimitProjectGcPrisma()

  // Step 1: find owners with more than maxProjects projects
  const ownerGroups = await prisma.project.groupBy({
    by: ["ownerId"],
    where: { ownerId: { not: null } },
    having: { ownerId: { _count: { gt: maxProjects } } },
    _count: { ownerId: true },
    orderBy: { ownerId: "asc" },
    take: OVER_LIMIT_PROJECT_GC_BATCH_SIZE,
  })

  for (const group of ownerGroups) {
    const ownerId = group.ownerId
    if (!ownerId) continue

    const { stamped, unstamped, deleted, alertRecipients } = await prisma.$transaction((tx) =>
      sweepOwnerProjects(tx, { ownerId, maxProjects, cutoff, now }),
    )

    totalStamped += stamped
    totalUnstamped += unstamped
    totalDeleted += deleted

    const purgeAt = new Date(now.getTime() + retentionDays * DAY_MS)
    totalAlertsSent += await sendOwnerOverLimitAlerts(prisma, { ownerId, projectNames: alertRecipients, purgeAt })
  }

  console.info("[tickward] scheduler.tick overLimitProjects", {
    stamped: totalStamped,
    unstamped: totalUnstamped,
    deleted: totalDeleted,
    alertsSent: totalAlertsSent,
  })

  return { stamped: totalStamped, unstamped: totalUnstamped, deleted: totalDeleted, alertsSent: totalAlertsSent }
}
