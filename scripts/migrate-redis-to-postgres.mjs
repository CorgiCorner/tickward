#!/usr/bin/env node

import "dotenv/config"

import { createHash, randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

import { Redis } from "@upstash/redis"
import pg from "pg"

const { Client } = pg

const PROJECT_PREFIX = "project:"
const ID_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const PROJECT_SNAPSHOT_VERSION = 2

export function hashRestoreKeyToken(restoreKey) {
  return createHash("sha256").update(restoreKey, "utf8").digest("hex")
}

export function classifyRedisKey(key) {
  if (key.startsWith(PROJECT_PREFIX)) {
    const id = key.slice(PROJECT_PREFIX.length)
    return ID_TOKEN_PATTERN.test(id) ? { kind: "project", id } : null
  }
  return null
}

export function parseRedisValue(value) {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function isProjectSnapshot(value) {
  return (
    value &&
    typeof value === "object" &&
    value.version === PROJECT_SNAPSHOT_VERSION &&
    typeof value.name === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.timers) &&
    Array.isArray(value.spaces)
  )
}

function dateFromIso(value, fallback = new Date()) {
  if (typeof value !== "string") return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function optionalDateFromIso(value) {
  if (typeof value !== "string") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function legacyId(prefix, id) {
  return `${prefix}_${id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48) || randomUUID()}`
}

function parseArgs(argv) {
  const args = new Set(argv)
  const batchArg = argv.find((arg) => arg.startsWith("--batch-size="))
  const batchSize = batchArg ? Number.parseInt(batchArg.slice("--batch-size=".length), 10) : 100
  return {
    write: args.has("--write"),
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 100,
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function redisClientFromEnv() {
  return new Redis({
    url: requireEnv("UPSTASH_REDIS_REST_URL"),
    token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
  })
}

async function* scanRedis(redis, match, count) {
  let cursor = "0"
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match, count })
    cursor = String(nextCursor)
    if (keys.length > 0) yield keys
  } while (cursor !== "0")
}

async function findProjectIdByTokenHash(db, tokenHash) {
  const result = await db.query('SELECT "projectId" FROM "project_access_token" WHERE "tokenHash" = $1 LIMIT 1', [
    tokenHash,
  ])
  return result.rows[0]?.projectId ?? null
}

async function upsertProject(db, restoreKey, project) {
  const tokenHash = hashRestoreKeyToken(restoreKey)
  const projectId = (await findProjectIdByTokenHash(db, tokenHash)) ?? legacyId("redis_project", tokenHash.slice(0, 24))
  const tokenId = legacyId("redis_token", tokenHash.slice(0, 24))
  const updatedAt = dateFromIso(project.updatedAt)

  await db.query("BEGIN")
  try {
    await db.query(
      `INSERT INTO "project" ("id", "name", "color", "snapshot", "updatedAt")
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "color" = EXCLUDED."color",
         "snapshot" = EXCLUDED."snapshot",
         "updatedAt" = EXCLUDED."updatedAt"`,
      [projectId, project.name, project.color ?? null, JSON.stringify(project), updatedAt],
    )

    await db.query(
      `INSERT INTO "project_access_token" ("id", "tokenHash", "projectId")
       VALUES ($1, $2, $3)
       ON CONFLICT ("tokenHash") DO UPDATE SET
         "projectId" = EXCLUDED."projectId",
         "revokedAt" = NULL,
         "expiresAt" = NULL`,
      [tokenId, tokenHash, projectId],
    )

    await db.query('DELETE FROM "timer" WHERE "projectId" = $1', [projectId])
    await db.query('DELETE FROM "space" WHERE "projectId" = $1', [projectId])

    for (const timer of project.timers) {
      if (!timer || typeof timer !== "object" || typeof timer.id !== "string") continue
      const createdAt = dateFromIso(timer.createdAt, updatedAt)
      const timerUpdatedAt = dateFromIso(timer.updatedAt ?? timer.createdAt, createdAt)
      await db.query(
        `INSERT INTO "timer" ("id", "projectId", "ownerId", "data", "createdAt", "updatedAt", "archivedAt")
         VALUES ($1, $2, NULL, $3::jsonb, $4, $5, $6)
         ON CONFLICT ("id") DO UPDATE SET
           "projectId" = EXCLUDED."projectId",
           "ownerId" = EXCLUDED."ownerId",
           "data" = EXCLUDED."data",
           "createdAt" = EXCLUDED."createdAt",
           "updatedAt" = EXCLUDED."updatedAt",
           "archivedAt" = EXCLUDED."archivedAt"`,
        [timer.id, projectId, JSON.stringify(timer), createdAt, timerUpdatedAt, optionalDateFromIso(timer.archivedAt)],
      )
    }

    for (const space of project.spaces) {
      if (!space || typeof space !== "object" || typeof space.id !== "string") continue
      const createdAt = dateFromIso(space.createdAt, updatedAt)
      await db.query(
        `INSERT INTO "space" ("id", "projectId", "ownerId", "data", "createdAt", "updatedAt")
         VALUES ($1, $2, NULL, $3::jsonb, $4, $5)
         ON CONFLICT ("id") DO UPDATE SET
           "projectId" = EXCLUDED."projectId",
           "ownerId" = EXCLUDED."ownerId",
           "data" = EXCLUDED."data",
           "createdAt" = EXCLUDED."createdAt",
           "updatedAt" = EXCLUDED."updatedAt"`,
        [space.id, projectId, JSON.stringify(space), createdAt, createdAt],
      )
    }

    await db.query("COMMIT")
  } catch (error) {
    await db.query("ROLLBACK")
    throw error
  }
}

function emptyStats() {
  return {
    project: { scanned: 0, migrated: 0, skipped: 0, failed: 0 },
  }
}

async function migrateKeys({ redis, db, keys, write, stats }) {
  const classifiedKeys = keys
    .map((key) => ({ key, classification: classifyRedisKey(key) }))
    .filter((item) => item.classification)
  if (classifiedKeys.length === 0) return

  const values = await redis.mget(...classifiedKeys.map((item) => item.key))
  for (let index = 0; index < classifiedKeys.length; index++) {
    const { key, classification } = classifiedKeys[index]
    const value = parseRedisValue(values[index])
    const itemStats = stats[classification.kind]
    itemStats.scanned += 1

    try {
      if (classification.kind === "project") {
        if (!isProjectSnapshot(value)) {
          itemStats.skipped += 1
          continue
        }
        if (write) await upsertProject(db, classification.id, value)
      }
      itemStats.migrated += 1
    } catch (error) {
      itemStats.failed += 1
      console.error(`Failed to migrate ${key}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export async function migrateRedisToPostgres(options = {}) {
  const write = Boolean(options.write)
  const batchSize = options.batchSize ?? 100
  const redis = options.redis ?? redisClientFromEnv()
  const db = write ? (options.db ?? new Client({ connectionString: requireEnv("DATABASE_URL") })) : options.db
  const stats = emptyStats()

  if (write && !options.db) await db.connect()
  try {
    for (const match of [`${PROJECT_PREFIX}*`]) {
      for await (const keys of scanRedis(redis, match, batchSize)) {
        await migrateKeys({ redis, db, keys, write, stats })
      }
    }
  } finally {
    if (write && !options.db) await db.end()
  }

  return stats
}

function printStats(stats, write) {
  console.log(write ? "Redis to Postgres migration completed." : "Redis to Postgres migration dry-run completed.")
  for (const [kind, item] of Object.entries(stats)) {
    console.log(
      `${kind}: scanned=${item.scanned} ${write ? "migrated" : "would_migrate"}=${item.migrated} skipped=${item.skipped} failed=${item.failed}`,
    )
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.write) {
    console.log("Dry-run mode. Re-run with --write to write to Postgres.")
  }
  const stats = await migrateRedisToPostgres(options)
  printStats(stats, options.write)
  const failed = Object.values(stats).some((item) => item.failed > 0)
  if (failed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
