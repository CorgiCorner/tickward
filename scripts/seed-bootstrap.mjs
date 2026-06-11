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
export const BOOTSTRAP_DEMO_SHARE_ID = "share_lisbon_flight_2026"
export const BOOTSTRAP_DEMO_SHARED_TIMER_ID = "timer_lisbon_flight"

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
    notify: true,
    pinned: args.pinned,
    spaceId: args.spaceId,
    ...sharedFields,
    notification: {
      enabled: true,
    },
  }
}

export function createBootstrapDemoProject(baseDate = new Date(), projectId = BOOTSTRAP_DEMO_PROJECT_ID) {
  const createdAt = new Date(baseDate)
  createdAt.setUTCMinutes(0, 0, 0)
  const nowIso = createdAt.toISOString()

  const spaces = [
    {
      id: "space_plans",
      name: "Plans",
      color: "#2563eb",
      createdAt: nowIso,
    },
    {
      id: "space_deadlines",
      name: "Deadlines",
      color: "#d97706",
      createdAt: nowIso,
    },
  ]

  const timers = [
    demoTimer({
      id: BOOTSTRAP_DEMO_SHARED_TIMER_ID,
      label: "Flight to Lisbon",
      description: "Bags by the door the night before. Passport in the front pocket this time.",
      targetDate: addDays(createdAt, 3, 6, 40),
      color: "#2563eb",
      spaceId: "space_plans",
      pinned: true,
      sharedAt: nowIso,
      shareId: BOOTSTRAP_DEMO_SHARE_ID,
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_marta_birthday",
      label: "Marta's birthday",
      description: "Order the cake by Tuesday. She noticed it was last-minute last year.",
      targetDate: addDays(createdAt, 6, 18),
      color: "#db2777",
      spaceId: "space_plans",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_lease_decision",
      label: "Lease renewal decision",
      description: "Compare a few places before it auto-renews. Email the landlord either way.",
      targetDate: addDays(createdAt, 9, 17),
      color: "#d97706",
      spaceId: "space_deadlines",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_stadium_gig",
      label: "Stadium gig with Ola",
      description: "Gates at six. Earplugs this time, no excuses.",
      targetDate: addDays(createdAt, 12, 18),
      color: "#7c3aed",
      spaceId: "space_plans",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_visa_window",
      label: "Visa appointment",
      description: "Print the confirmation and bring both photos. Get there 15 minutes early.",
      targetDate: addDays(createdAt, 15, 8, 30),
      color: "#dc2626",
      spaceId: "space_deadlines",
      createdAt: nowIso,
    }),
    demoTimer({
      id: "timer_race_day",
      label: "Half marathon",
      description: "Nothing new on race morning. Same shoes, same breakfast.",
      targetDate: addDays(createdAt, 20, 9),
      color: "#0d9488",
      spaceId: "space_plans",
      createdAt: nowIso,
    }),
  ]

  const snapshot = {
    version: PROJECT_SNAPSHOT_VERSION,
    name: "Big days",
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
