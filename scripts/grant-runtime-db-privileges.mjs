#!/usr/bin/env node

import "dotenv/config"

import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import pg from "pg"

const { Client } = pg

/**
 * @typedef {{ connectionString: string, runtimeRole: string, schema: string }} RuntimeGrantConfig
 * @typedef {{ query(statement: string): Promise<unknown>, connect?: () => Promise<unknown>, end?: () => Promise<unknown> }} RuntimeGrantClient
 * @typedef {{ client?: RuntimeGrantClient, config?: RuntimeGrantConfig, createClient?: (connectionString: string) => RuntimeGrantClient }} GrantRuntimeDatabasePrivilegesOptions
 */

function trimmed(value) {
  return typeof value === "string" ? value.trim() : ""
}

function parseConnectionUrl(value, label) {
  try {
    return new URL(value)
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL connection URL`)
  }
}

function schemaFromUrl(value) {
  if (!value) return ""
  const url = parseConnectionUrl(value, "DATABASE_URL")
  return trimmed(url.searchParams.get("schema"))
}

function usernameFromUrl(value) {
  if (!value) return ""
  const url = parseConnectionUrl(value, "DATABASE_URL")
  return decodeURIComponent(url.username)
}

export function quoteSqlIdentifier(value) {
  const identifier = trimmed(value)
  if (!identifier) throw new Error("SQL identifier cannot be empty")
  if (identifier.includes("\0")) throw new Error("SQL identifier cannot contain NUL bytes")
  return `"${identifier.replaceAll('"', '""')}"`
}

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function runtimeGrantConfigFromEnv(env = process.env) {
  const databaseUrl = trimmed(env.DATABASE_URL)
  const directUrl = trimmed(env.DIRECT_URL)
  const connectionString = directUrl || databaseUrl
  if (!connectionString) throw new Error("Missing DIRECT_URL or DATABASE_URL for runtime privilege grants")

  const runtimeRole = trimmed(env.TICKWARD_DATABASE_RUNTIME_ROLE) || usernameFromUrl(databaseUrl)
  if (!runtimeRole) {
    throw new Error("Missing runtime database role. Set DATABASE_URL or TICKWARD_DATABASE_RUNTIME_ROLE.")
  }

  const schema =
    trimmed(env.TICKWARD_DATABASE_SCHEMA) || schemaFromUrl(databaseUrl) || schemaFromUrl(connectionString) || "public"

  return {
    connectionString,
    runtimeRole,
    schema,
  }
}

/**
 * @param {RuntimeGrantConfig} config
 */
export function buildRuntimePrivilegeStatements(config) {
  const schema = quoteSqlIdentifier(config.schema)
  const role = quoteSqlIdentifier(config.runtimeRole)

  return [
    `GRANT USAGE ON SCHEMA ${schema} TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`,
  ]
}

/**
 * @param {string} connectionString
 */
export function pgClientConfigForConnectionString(connectionString) {
  const url = parseConnectionUrl(connectionString, "DATABASE_URL")
  const sslmode = trimmed(url.searchParams.get("sslmode"))
  const sslrootcert = trimmed(url.searchParams.get("sslrootcert"))

  if (!sslmode || sslmode === "disable") return { connectionString }
  if (sslmode === "require") return { connectionString, ssl: { rejectUnauthorized: false } }

  if (sslmode === "verify-ca" || sslmode === "verify-full") {
    if (!sslrootcert) throw new Error(`${sslmode} requires sslrootcert in the PostgreSQL connection URL`)
    return {
      connectionString,
      ssl: {
        ca: readFileSync(sslrootcert, "utf8"),
        rejectUnauthorized: true,
        servername: sslmode === "verify-full" ? url.hostname : undefined,
      },
    }
  }

  throw new Error(`Unsupported PostgreSQL sslmode for runtime privilege grants: ${sslmode}`)
}

/**
 * @param {RuntimeGrantClient} client
 */
async function connectOwnedClient(client) {
  if (typeof client.connect !== "function") throw new Error("Runtime grant client is missing connect().")
  await client.connect()
}

/**
 * @param {RuntimeGrantClient} client
 */
async function endOwnedClient(client) {
  if (typeof client.end !== "function") throw new Error("Runtime grant client is missing end().")
  await client.end()
}

/**
 * @param {GrantRuntimeDatabasePrivilegesOptions} [options]
 */
export async function grantRuntimeDatabasePrivileges({
  client,
  config = runtimeGrantConfigFromEnv(),
  createClient = (connectionString) => new Client(pgClientConfigForConnectionString(connectionString)),
} = {}) {
  const db = client ?? createClient(config.connectionString)
  const ownsClient = !client
  const statements = buildRuntimePrivilegeStatements(config)

  if (ownsClient) await connectOwnedClient(db)
  try {
    for (const statement of statements) {
      await db.query(statement)
    }
  } finally {
    if (ownsClient) await endOwnedClient(db)
  }

  return {
    runtimeRole: config.runtimeRole,
    schema: config.schema,
    statements,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  grantRuntimeDatabasePrivileges()
    .then(({ runtimeRole, schema }) => {
      console.log(`Granted runtime database privileges to ${runtimeRole} on schema ${schema}.`)
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
