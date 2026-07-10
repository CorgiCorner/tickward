import "server-only"

import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type AuditEventInput = {
  action: string
  actorId?: string | null
  actorEmail?: string | null
  targetType?: string | null
  targetId?: string | null
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
}

export type AuditRequestContext = {
  ip: string | null
  userAgent: string | null
}

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function jsonInput(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function auditRequestContext(input: Request | Headers): AuditRequestContext {
  const headers = input instanceof Request ? input.headers : input
  const forwardedFor = headers.get("x-forwarded-for")?.split(",", 1)[0] ?? null
  return {
    ip: cleanString(forwardedFor),
    userAgent: cleanString(headers.get("user-agent")),
  }
}

export function recordAuditEvent(input: AuditEventInput): void {
  try {
    const prisma = requirePrismaClient()
    const metadata = input.metadata ? jsonInput(input.metadata) : undefined

    void prisma.auditLog
      .create({
        data: {
          action: input.action,
          actorEmail: cleanString(input.actorEmail),
          actorId: cleanString(input.actorId),
          ip: cleanString(input.ip),
          metadata,
          targetId: cleanString(input.targetId),
          targetType: cleanString(input.targetType),
          userAgent: cleanString(input.userAgent),
        },
      })
      .catch((err: unknown) => {
        console.error("[tickward] audit.write", err)
      })
  } catch (err) {
    console.error("[tickward] audit.write", err)
  }
}

export async function purgeOldAuditEvents(retentionDays = 400): Promise<number> {
  try {
    const prisma = requirePrismaClient()
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY)
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    return result.count
  } catch (err) {
    console.error("[tickward] audit.purge", err)
    return 0
  }
}
