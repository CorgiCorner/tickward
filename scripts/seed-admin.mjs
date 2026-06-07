#!/usr/bin/env node

import "dotenv/config"

import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

import pg from "pg"

const { Client } = pg

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeAdminSeedEnv(env = process.env) {
  const email = env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error("Missing required environment variable: SEED_ADMIN_EMAIL")
  if (!emailPattern.test(email)) throw new Error("SEED_ADMIN_EMAIL must be a valid email address")

  return {
    email,
    name: env.SEED_ADMIN_NAME?.trim() || email,
    id: env.SEED_ADMIN_ID?.trim() || `admin_${randomUUID()}`,
  }
}

function requireDatabaseUrl(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error("Missing required environment variable: DATABASE_URL")
  return databaseUrl
}

export async function seedAdmin({ db, admin }) {
  const result = await db.query(
    `INSERT INTO "user" ("id", "name", "email", "emailVerified", "role", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, TRUE, 'admin', now(), now())
     ON CONFLICT ("email") DO UPDATE SET
       "name" = EXCLUDED."name",
       "emailVerified" = TRUE,
       "role" = 'admin',
       "updatedAt" = now()
     RETURNING "id"`,
    [admin.id, admin.name, admin.email],
  )
  return result?.rows?.[0]?.id ?? admin.id
}

async function main() {
  const admin = normalizeAdminSeedEnv()
  const db = new Client({ connectionString: requireDatabaseUrl() })
  await db.connect()
  try {
    await seedAdmin({ db, admin })
  } finally {
    await db.end()
  }
  console.log(`Admin user ensured for ${admin.email}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
