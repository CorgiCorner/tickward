import "server-only"

import { requirePrismaClient } from "@/lib/db/prisma.server"

const MAX_TRANSACTION_ATTEMPTS = 3

function isTransactionConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034"
}

export async function hasAnyAdmin() {
  return (await requirePrismaClient().user.count({ where: { role: "admin" } })) > 0
}

export async function claimAdminBootstrap(userId: string): Promise<boolean> {
  const prisma = requirePrismaClient()

  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const promoted = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE "user"
            SET "role" = 'admin', "updatedAt" = NOW()
            WHERE "id" = ${userId}
              AND NOT EXISTS (SELECT 1 FROM "user" WHERE "role" = 'admin')
            RETURNING "id"
          `
          if (promoted.length === 0) return false

          await tx.auditLog.create({
            data: {
              action: "auth.admin.bootstrap",
              actorId: userId,
              targetId: userId,
              targetType: "user",
            },
          })
          return true
        },
        { isolationLevel: "Serializable" },
      )
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === MAX_TRANSACTION_ATTEMPTS) throw error
    }
  }

  return false
}
