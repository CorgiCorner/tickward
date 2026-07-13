import "server-only"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { formatMessage } from "@/lib/i18n/messages"
import { getDatabaseSchema, getDatabaseUrl } from "@/lib/private-config.server"

type TickwardPrismaGlobal = typeof globalThis & {
  tickwardPrisma?: PrismaClient
}

export class ServerPersistenceUnavailableError extends Error {
  constructor() {
    super(formatMessage("errors.databaseRequired"))
    this.name = "ServerPersistenceUnavailableError"
  }
}

export function isServerPersistenceUnavailableError(value: unknown): value is ServerPersistenceUnavailableError {
  return value instanceof ServerPersistenceUnavailableError
}

export function getPrismaClient(): PrismaClient | null {
  const databaseUrl = getDatabaseUrl()
  if (!databaseUrl) return null

  const globalForPrisma = globalThis as TickwardPrismaGlobal
  globalForPrisma.tickwardPrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }, { schema: getDatabaseSchema() }),
  })

  return globalForPrisma.tickwardPrisma
}

export function requirePrismaClient(): PrismaClient {
  const prisma = getPrismaClient()
  if (!prisma) throw new ServerPersistenceUnavailableError()
  return prisma
}
