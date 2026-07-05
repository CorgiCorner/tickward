#!/usr/bin/env node

import "dotenv/config"

import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"

import pg from "pg"

import { normalizeAdminSeedEnv, seedAdmin } from "./seed-admin.mjs"

const { Client } = pg

export const BOOTSTRAP_DEMO_PROJECT_ID = "demo_big_days"
export const BOOTSTRAP_DEMO_RESTORE_KEY = "demoBigDays2026"
export const BOOTSTRAP_DEMO_ACCESS_TOKEN_ID = "seed_demo_big_days_access"
export const BOOTSTRAP_DEMO_SHARE_ID = "share_train_gdansk_2026"
export const BOOTSTRAP_DEMO_SHARED_TIMER_ID = "timer_train_gdansk"

const PROJECT_SNAPSHOT_VERSION = 2
const idTokenPattern = /^[A-Za-z0-9_-]{8,64}$/
const projectIdPattern = /^[A-Za-z0-9_-]{6,128}$/

function requireDatabaseUrl(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error("Missing required environment variable: DATABASE_URL")
  return databaseUrl
}

function parseBaseDate(value) {
  if (!value) return new Date()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error("SEED_DEMO_BASE_DATE must be a valid date")
  return parsed
}

export function normalizeBootstrapSeedEnv(env = process.env) {
  const admin = normalizeAdminSeedEnv(env)
  const projectId = env.SEED_DEMO_PROJECT_ID?.trim() || BOOTSTRAP_DEMO_PROJECT_ID
  const restoreKey = env.SEED_DEMO_RESTORE_KEY?.trim() || BOOTSTRAP_DEMO_RESTORE_KEY

  if (!projectIdPattern.test(projectId)) throw new Error("SEED_DEMO_PROJECT_ID must be 6-128 URL-safe characters")
  if (!idTokenPattern.test(restoreKey)) throw new Error("SEED_DEMO_RESTORE_KEY must be 8-64 URL-safe characters")

  return {
    admin,
    demo: {
      projectId,
      restoreKey,
      baseDate: parseBaseDate(env.SEED_DEMO_BASE_DATE),
    },
  }
}

function addDays(base, days, hour, minute = 0) {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + days)
  next.setUTCHours(hour, minute, 0, 0)
  return next.toISOString()
}

function demoTimer(args) {
  const sharedFields =
    args.sharedAt && args.shareId
      ? {
          sharedAt: args.sharedAt,
          sourceShareId: args.shareId,
        }
      : {}

  return {
    id: args.id,
    label: args.label,
    targetDate: args.targetDate,
    timezone: "Europe/Warsaw",
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    color: args.color,
    description: args.description,
    notify: args.notify ?? true,
    pinned: args.pinned,
    recurrence: args.recurrence,
    spaceId: args.spaceId,
    ...sharedFields,
    notification: {
      enabled: args.notify ?? true,
    },
  }
}

export function createBootstrapDemoProject(baseDate = new Date(), projectId = BOOTSTRAP_DEMO_PROJECT_ID) {
  const createdAt = new Date(baseDate)
  createdAt.setUTCMinutes(0, 0, 0)
  const nowIso = createdAt.toISOString()

  const spaces = [
    {
      id: "space_doing",
      name: "Coming up",
      color: "#2563eb",
      createdAt: nowIso,
    },
    {
      id: "space_done",
      name: "Done",
      color: "#16a34a",
      createdAt: nowIso,
    },
  ]

  const timers = [
    demoTimer({
      id: BOOTSTRAP_DEMO_SHARED_TIMER_ID,
      label: "Train to Gdansk",
      description: "Tickets are in the wallet. Pack the charger before leaving.",
      targetDate: addDays(createdAt, 1, 15),
      color: "#2563eb",
      spaceId: "space_doing",
      pinned: true,
      sharedAt: nowIso,
      shareId: BOOTSTRAP_DEMO_SHARE_ID,
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_balcony_herbs",
      label: "Water balcony herbs",
      description: "Do it before the afternoon sun hits the pots.",
      targetDate: addDays(createdAt, 1, 8, 45),
      color: "#0d9488",
      spaceId: "space_doing",
      recurrence: { enabled: true, type: "daily" },
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_sunday_reset",
      label: "Sunday reset",
      description: "Laundry, clean the fridge shelf, and pick meals for the first half of the week.",
      targetDate: addDays(createdAt, 4, 9, 30),
      color: "#d97706",
      spaceId: "space_doing",
      recurrence: { enabled: true, type: "weekly" },
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_marta_birthday",
      label: "Marta's birthday",
      description: "Order the cake by Tuesday and hide the candles before she visits.",
      targetDate: addDays(createdAt, 6, 17),
      color: "#7c3aed",
      spaceId: "space_doing",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_lease_renewal",
      label: "Lease renewal call",
      description: "Call the landlord before the renewal window closes.",
      targetDate: addDays(createdAt, 9, 12),
      color: "#dc2626",
      spaceId: "space_doing",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_parcel_picked_up",
      label: "Parcel picked up",
      description: "Collected the lamp from the pickup point on the way home.",
      targetDate: addDays(createdAt, -1, 20),
      color: "#16a34a",
      spaceId: "space_done",
      notify: false,
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_dentist_booked",
      label: "Dentist booked",
      description: "Appointment confirmed; reminder can stay off now.",
      targetDate: addDays(createdAt, -3, 16),
      color: "#64748b",
      spaceId: "space_done",
      notify: false,
      createdAt: nowIso,
    }),
  ]

  const snapshot = {
    version: PROJECT_SNAPSHOT_VERSION,
    name: "Home week",
    color: "#2563eb",
    timers,
    spaces,
    updatedAt: nowIso,
  }

  return {
    projectId,
    createdAt: nowIso,
    snapshot,
    share: {
      id: BOOTSTRAP_DEMO_SHARE_ID,
      kind: "timer",
      data: {
        timerId: BOOTSTRAP_DEMO_SHARED_TIMER_ID,
        sharedAt: nowIso,
      },
    },
  }
}

function hashRestoreKeyToken(restoreKey) {
  return createHash("sha256").update(restoreKey, "utf8").digest("hex")
}

function projectFields(seed) {
  return [
    seed.projectId,
    seed.snapshot.name,
    seed.snapshot.color,
    seed.snapshot,
    seed.createdAt,
    seed.snapshot.updatedAt,
  ]
}

function assertSeedUpsert(result, message) {
  if (result.rows?.length === 0) throw new Error(message)
}

async function seedDemoProject({ db, seed, restoreKey }) {
  const projectResult = await db.query(
    `INSERT INTO "project" ("id", "ownerId", "name", "color", "snapshot", "createdAt", "updatedAt", "claimedAt")
     VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL)
     ON CONFLICT ("id") DO UPDATE SET
       "name" = EXCLUDED."name",
       "color" = EXCLUDED."color",
       "snapshot" = EXCLUDED."snapshot",
       "updatedAt" = EXCLUDED."updatedAt"
     RETURNING "ownerId", "claimedAt"`,
    projectFields(seed),
  )

  const ownerId = projectResult.rows?.[0]?.ownerId ?? null
  const claimedAt = projectResult.rows?.[0]?.claimedAt ?? null

  if (!claimedAt) {
    assertSeedUpsert(
      await db.query(
        `INSERT INTO "project_access_token" ("id", "tokenHash", "projectId", "createdAt", "claimedAt", "revokedAt", "expiresAt")
         VALUES ($1, $2, $3, $4, NULL, NULL, NULL)
         ON CONFLICT ("tokenHash") DO UPDATE SET
           "projectId" = EXCLUDED."projectId",
           "claimedAt" = NULL,
           "revokedAt" = NULL,
           "expiresAt" = NULL
         WHERE "project_access_token"."projectId" = EXCLUDED."projectId"
         RETURNING "id"`,
        [BOOTSTRAP_DEMO_ACCESS_TOKEN_ID, hashRestoreKeyToken(restoreKey), seed.projectId, seed.createdAt],
      ),
      "Seed restore key is already attached to a different project.",
    )
  }

  for (const space of seed.snapshot.spaces) {
    assertSeedUpsert(
      await db.query(
        `INSERT INTO "space" ("id", "projectId", "ownerId", "data", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT ("id") DO UPDATE SET
         "ownerId" = EXCLUDED."ownerId",
         "data" = EXCLUDED."data",
         "updatedAt" = EXCLUDED."updatedAt"
       WHERE "space"."projectId" = EXCLUDED."projectId"
       RETURNING "id"`,
        [space.id, seed.projectId, ownerId, space, space.createdAt],
      ),
      `Seed space id collision outside demo project: ${space.id}`,
    )
  }

  for (const timer of seed.snapshot.timers) {
    assertSeedUpsert(
      await db.query(
        `INSERT INTO "timer" ("id", "projectId", "ownerId", "data", "createdAt", "updatedAt", "archivedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NULL)
       ON CONFLICT ("id") DO UPDATE SET
         "ownerId" = EXCLUDED."ownerId",
         "data" = EXCLUDED."data",
         "updatedAt" = EXCLUDED."updatedAt",
         "archivedAt" = NULL
       WHERE "timer"."projectId" = EXCLUDED."projectId"
       RETURNING "id"`,
        [timer.id, seed.projectId, ownerId, timer, timer.createdAt, timer.updatedAt ?? timer.createdAt],
      ),
      `Seed timer id collision outside demo project: ${timer.id}`,
    )
  }

  assertSeedUpsert(
    await db.query(
      `INSERT INTO "share" ("id", "projectId", "ownerId", "kind", "data", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT ("id") DO UPDATE SET
       "ownerId" = EXCLUDED."ownerId",
       "kind" = EXCLUDED."kind",
       "data" = EXCLUDED."data",
       "updatedAt" = EXCLUDED."updatedAt"
     WHERE "share"."projectId" = EXCLUDED."projectId"
     RETURNING "id"`,
      [seed.share.id, seed.projectId, ownerId, seed.share.kind, seed.share.data, seed.createdAt],
    ),
    `Seed share id collision outside demo project: ${seed.share.id}`,
  )

  return { claimed: Boolean(claimedAt), ownerId }
}

/**
 * @param {{
 *   db: { query: (...args: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> } | undefined> },
 *   env?: Record<string, string | undefined>
 * }} args
 */
export async function seedBootstrap({ db, env = process.env }) {
  const config = normalizeBootstrapSeedEnv(env)
  const demoSeed = createBootstrapDemoProject(config.demo.baseDate, config.demo.projectId)

  await db.query("BEGIN")
  try {
    const adminId = await seedAdmin({ db, admin: config.admin })
    const demo = await seedDemoProject({
      db,
      seed: demoSeed,
      restoreKey: config.demo.restoreKey,
    })
    await db.query("COMMIT")

    return {
      adminEmail: config.admin.email,
      adminId,
      projectId: demoSeed.projectId,
      projectName: demoSeed.snapshot.name,
      restoreKey: config.demo.restoreKey,
      shareId: demoSeed.share.id,
      timerCount: demoSeed.snapshot.timers.length,
      spaceCount: demoSeed.snapshot.spaces.length,
      claimed: demo.claimed,
    }
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {})
    throw error
  }
}

async function main() {
  const db = new Client({ connectionString: requireDatabaseUrl() })
  await db.connect()
  try {
    const result = await seedBootstrap({ db })
    console.log(`Admin user ensured for ${result.adminEmail}.`)
    console.log(
      `Demo project ensured: ${result.projectName} (${result.projectId}), ${result.timerCount} timers, ${result.spaceCount} spaces.`,
    )
    console.log(`Demo restore key: ${result.restoreKey}`)
    if (result.claimed) console.log("Demo project is already claimed; restore-key access was not re-enabled.")
    console.log(`Demo share path: /share/${result.shareId}`)
  } finally {
    await db.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
