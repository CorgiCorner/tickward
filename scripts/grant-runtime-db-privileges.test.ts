import { existsSync, readFileSync } from "node:fs"

import { describe, expect, it, vi } from "vitest"

import {
  buildRuntimePrivilegeStatements,
  grantRuntimeDatabasePrivileges,
  runRuntimeGrantCli,
  runtimeGrantConfigFromEnv,
} from "./grant-runtime-db-privileges.mjs"

describe("runtime database privilege grants", () => {
  it("uses the direct connection and grants the runtime DATABASE_URL role", () => {
    const config = runtimeGrantConfigFromEnv({
      DATABASE_URL: "postgresql://app_runtime:runtime-secret@db.example.test:5432/tickward?schema=app",
      DIRECT_URL: "postgresql://migration_owner:admin-secret@db.example.test:5432/tickward?schema=app",
    })

    expect(config.connectionString).toBe(
      "postgresql://migration_owner:admin-secret@db.example.test:5432/tickward?schema=app",
    )
    expect(config.runtimeRole).toBe("app_runtime")
    expect(config.schema).toBe("app")
  })

  it("allows an explicit runtime role without leaking credentials into SQL", () => {
    const config = runtimeGrantConfigFromEnv({
      DATABASE_URL: "postgresql://pooled_user:runtime-secret@db.example.test:5432/tickward",
      DIRECT_URL: "postgresql://migration_owner:admin-secret@db.example.test:5432/tickward",
      TICKWARD_DATABASE_RUNTIME_ROLE: "app_runtime",
      TICKWARD_DATABASE_SCHEMA: "public",
    })

    const statements = buildRuntimePrivilegeStatements(config)

    expect(statements).toEqual([
      'GRANT USAGE ON SCHEMA "public" TO "app_runtime"',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "app_runtime"',
      'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "public" TO "app_runtime"',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app_runtime"',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "app_runtime"',
    ])
    expect(statements.join("\n")).not.toContain("runtime-secret")
    expect(statements.join("\n")).not.toContain("admin-secret")
  })

  it("executes every grant statement through the supplied client", async () => {
    const config = {
      connectionString: "postgresql://admin:secret@db.example.test:5432/tickward",
      runtimeRole: "app_runtime",
      schema: "public",
    }
    const queries: string[] = []
    const client = {
      query: async (statement: string) => {
        queries.push(statement)
      },
    }

    await grantRuntimeDatabasePrivileges({
      client,
      config,
    })

    expect(queries).toEqual(buildRuntimePrivilegeStatements(config))
  })

  it("does not print privileged context on success or failure", async () => {
    const log = vi.fn()
    const logError = vi.fn()

    await expect(
      runRuntimeGrantCli({
        grant: async () => ({
          connectionString: "postgresql://owner:secret@db.example.test/tickward",
          runtimeRole: "private_runtime_role",
          schema: "private_schema",
          statements: ['GRANT ALL ON SCHEMA "private_schema" TO "private_runtime_role"'],
        }),
        log,
        logError,
      }),
    ).resolves.toBe(true)
    await expect(
      runRuntimeGrantCli({
        grant: async () => {
          throw new Error(
            "connection to postgresql://owner:secret@db.example.test/tickward failed while running GRANT ALL",
          )
        },
        log,
        logError,
      }),
    ).resolves.toBe(false)

    const output = [...log.mock.calls, ...logError.mock.calls].flat().join("\n")
    expect(output).toBe("Runtime database privileges granted.\nRuntime database privilege grant failed.")
    expect(output).not.toMatch(/postgresql:|secret|private_|GRANT ALL/i)
  })

  it("keeps public database configuration free of committed passwords", () => {
    const optionalAdapterEnv = ["scripts", ["public", "overrides"].join("-"), ".env.example"].join("/")
    const sources = ["docker-compose.yml", ".env.example", optionalAdapterEnv, "prisma.config.ts"]
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file, "utf8"))

    for (const source of sources) {
      expect(source).not.toMatch(/postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/i)
      expect(source).not.toMatch(/POSTGRES_PASSWORD:\s*\$\{[^}]+:-[^}]+\}/)
    }
  })
})
