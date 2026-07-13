import { describe, expect, it } from "vitest"

import { smokeDockerDatabaseEnv } from "./smoke-docker.mjs"

describe("smokeDockerDatabaseEnv", () => {
  it("creates matching non-empty local database credentials for Docker Compose", () => {
    const env = smokeDockerDatabaseEnv()
    const databaseUrl = new URL(env.DATABASE_URL)

    expect(env.POSTGRES_PASSWORD).toMatch(/^[a-f0-9]{48}$/)
    expect(env.DIRECT_URL).toBe(env.DATABASE_URL)
    expect(databaseUrl.hostname).toBe("postgres")
    expect(databaseUrl.username).toBe("tickward")
    expect(databaseUrl.password).toBe(env.POSTGRES_PASSWORD)
    expect(databaseUrl.pathname).toBe("/tickward")
  })
})
