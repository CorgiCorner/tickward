import { describe, expect, it } from "vitest"

import {
  buildRuntimePrivilegeStatements,
  grantRuntimeDatabasePrivileges,
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
})
