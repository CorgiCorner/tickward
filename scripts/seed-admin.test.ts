import { describe, expect, it } from "vitest"

import { normalizeAdminSeedEnv, seedAdmin } from "./seed-admin.mjs"

describe("normalizeAdminSeedEnv", () => {
  it("normalizes admin seed values", () => {
    expect(
      normalizeAdminSeedEnv({
        NODE_ENV: "test",
        SEED_ADMIN_EMAIL: " Ada@Example.COM ",
        SEED_ADMIN_NAME: " Ada ",
        SEED_ADMIN_ID: " admin_ada ",
      }),
    ).toEqual({
      email: "ada@example.com",
      name: "Ada",
      id: "admin_ada",
    })
  })

  it("requires a valid admin email", () => {
    expect(() => normalizeAdminSeedEnv({ NODE_ENV: "test" })).toThrow("SEED_ADMIN_EMAIL")
    expect(() => normalizeAdminSeedEnv({ NODE_ENV: "test", SEED_ADMIN_EMAIL: "ada" })).toThrow("valid email")
  })

  it("rejects adversarial long email input without regex backtracking", () => {
    const longInvalidEmail = `${"a".repeat(100_000)}@example`

    expect(() => normalizeAdminSeedEnv({ NODE_ENV: "test", SEED_ADMIN_EMAIL: longInvalidEmail })).toThrow("valid email")
  })
})

describe("seedAdmin", () => {
  it("upserts an admin user by email", async () => {
    const queries: unknown[][] = []
    const db = {
      async query(...args: unknown[]) {
        queries.push(args)
      },
    }

    await expect(
      seedAdmin({
        db,
        admin: { id: "admin_1", name: "Ada", email: "ada@example.com" },
      }),
    ).resolves.toBe("admin_1")

    expect(queries).toHaveLength(1)
    expect(String(queries[0][0])).toContain('ON CONFLICT ("email") DO UPDATE')
    expect(String(queries[0][0])).toContain('RETURNING "id"')
    expect(queries[0][1]).toEqual(["admin_1", "Ada", "ada@example.com"])
  })

  it("returns the existing user id when the email already exists", async () => {
    const db = {
      async query() {
        return { rows: [{ id: "admin_existing" }] }
      },
    }

    await expect(
      seedAdmin({
        db,
        admin: { id: "admin_1", name: "Ada", email: "ada@example.com" },
      }),
    ).resolves.toBe("admin_existing")
  })

  it("upserts an admin user by email without a fake result shape", async () => {
    const queries: unknown[][] = []
    const db = {
      async query(...args: unknown[]) {
        queries.push(args)
      },
    }

    await expect(
      seedAdmin({
        db,
        admin: { id: "admin_1", name: "Ada", email: "ada@example.com" },
      }),
    ).resolves.toBe("admin_1")

    expect(queries).toHaveLength(1)
    expect(String(queries[0][0])).toContain('ON CONFLICT ("email") DO UPDATE')
    expect(queries[0][1]).toEqual(["admin_1", "Ada", "ada@example.com"])
  })
})
