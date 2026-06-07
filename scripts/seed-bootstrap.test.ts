import { describe, expect, it } from "vitest"

import { createDemoProject, DEMO_SHARE_ID, DEMO_SHARED_TIMER_ID } from "@/lib/demo-project"
import {
  BOOTSTRAP_DEMO_ACCESS_TOKEN_ID,
  BOOTSTRAP_DEMO_PROJECT_ID,
  BOOTSTRAP_DEMO_RESTORE_KEY,
  createBootstrapDemoProject,
  normalizeBootstrapSeedEnv,
  seedBootstrap,
} from "./seed-bootstrap.mjs"

describe("normalizeBootstrapSeedEnv", () => {
  it("normalizes admin and demo seed values", () => {
    const config = normalizeBootstrapSeedEnv({
      NODE_ENV: "test",
      SEED_ADMIN_EMAIL: " Admin@Example.COM ",
      SEED_ADMIN_NAME: " Admin ",
      SEED_ADMIN_ID: " admin_seed ",
      SEED_DEMO_PROJECT_ID: " demo_project ",
      SEED_DEMO_RESTORE_KEY: " demoRestoreKey_123 ",
      SEED_DEMO_BASE_DATE: "2026-06-06T10:15:00.000Z",
    })

    expect(config.admin).toEqual({
      email: "admin@example.com",
      name: "Admin",
      id: "admin_seed",
    })
    expect(config.demo.projectId).toBe("demo_project")
    expect(config.demo.restoreKey).toBe("demoRestoreKey_123")
    expect(config.demo.baseDate.toISOString()).toBe("2026-06-06T10:15:00.000Z")
  })

  it("uses stable demo defaults and validates URL-safe identifiers", () => {
    expect(
      normalizeBootstrapSeedEnv({
        NODE_ENV: "test",
        SEED_ADMIN_EMAIL: "admin@example.com",
      }).demo,
    ).toMatchObject({
      projectId: BOOTSTRAP_DEMO_PROJECT_ID,
      restoreKey: BOOTSTRAP_DEMO_RESTORE_KEY,
    })

    expect(() =>
      normalizeBootstrapSeedEnv({
        NODE_ENV: "test",
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_DEMO_PROJECT_ID: "bad id",
      }),
    ).toThrow("SEED_DEMO_PROJECT_ID")
    expect(() =>
      normalizeBootstrapSeedEnv({
        NODE_ENV: "test",
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_DEMO_RESTORE_KEY: "short",
      }),
    ).toThrow("SEED_DEMO_RESTORE_KEY")
  })
})

describe("createBootstrapDemoProject", () => {
  it("matches the browser demo project data used for screenshots", () => {
    const baseDate = new Date("2026-06-06T10:15:00.000Z")
    const browserDemo = createDemoProject(baseDate)
    const dbDemo = createBootstrapDemoProject(baseDate)

    expect(dbDemo.snapshot).toMatchObject({
      version: 2,
      name: browserDemo.project.name,
      color: browserDemo.project.color,
      timers: browserDemo.payload.timers,
      spaces: browserDemo.payload.spaces,
      updatedAt: browserDemo.payload.updatedAt,
    })
    expect(dbDemo.share).toEqual({
      id: DEMO_SHARE_ID,
      kind: "timer",
      data: {
        timerId: DEMO_SHARED_TIMER_ID,
        sharedAt: browserDemo.payload.updatedAt,
      },
    })
  })
})

describe("seedBootstrap", () => {
  it("creates the admin, demo project, restore key, spaces, timers, and share in one transaction", async () => {
    const queries: unknown[][] = []
    const db = {
      async query(...args: unknown[]) {
        queries.push(args)
        if (String(args[0]).includes('INSERT INTO "user"')) return { rows: [{ id: "admin_existing" }] }
        if (String(args[0]).includes('RETURNING "ownerId", "claimedAt"')) {
          return { rows: [{ ownerId: null, claimedAt: null }] }
        }
        if (String(args[0]).includes('RETURNING "id"')) return { rows: [{ id: "seed_row" }] }
        return { rows: [] }
      },
    }

    const result = await seedBootstrap({
      db,
      env: {
        NODE_ENV: "test",
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_ADMIN_NAME: "Admin",
        SEED_DEMO_BASE_DATE: "2026-06-06T10:15:00.000Z",
      },
    })

    expect(result).toMatchObject({
      adminEmail: "admin@example.com",
      adminId: "admin_existing",
      projectId: BOOTSTRAP_DEMO_PROJECT_ID,
      restoreKey: BOOTSTRAP_DEMO_RESTORE_KEY,
      shareId: DEMO_SHARE_ID,
      timerCount: 5,
      spaceCount: 2,
    })
    expect(queries[0][0]).toBe("BEGIN")
    expect(queries.at(-1)?.[0]).toBe("COMMIT")
    expect(queries.filter(([sql]) => String(sql).includes("DELETE FROM"))).toEqual([])
    expect(queries.some(([sql]) => String(sql).includes('INSERT INTO "project"'))).toBe(true)
    expect(queries.some(([sql]) => String(sql).includes('INSERT INTO "project_access_token"'))).toBe(true)
    const accessTokenInsert = queries.find(([sql]) => String(sql).includes('INSERT INTO "project_access_token"'))
    expect(String(accessTokenInsert?.[0])).toContain('"id", "tokenHash", "projectId"')
    expect(String(accessTokenInsert?.[0])).toContain('WHERE "project_access_token"."projectId" = EXCLUDED."projectId"')
    expect(accessTokenInsert?.[1]).toEqual([
      BOOTSTRAP_DEMO_ACCESS_TOKEN_ID,
      expect.any(String),
      BOOTSTRAP_DEMO_PROJECT_ID,
      "2026-06-06T10:00:00.000Z",
    ])
    expect(queries.filter(([sql]) => String(sql).includes('INSERT INTO "space"'))).toHaveLength(2)
    expect(queries.filter(([sql]) => String(sql).includes('INSERT INTO "timer"'))).toHaveLength(5)
    expect(queries.some(([sql]) => String(sql).includes('INSERT INTO "share"'))).toBe(true)
    expect(queries.some(([sql]) => String(sql).includes('WHERE "space"."projectId" = EXCLUDED."projectId"'))).toBe(true)
    expect(queries.some(([sql]) => String(sql).includes('WHERE "timer"."projectId" = EXCLUDED."projectId"'))).toBe(true)
    expect(queries.some(([sql]) => String(sql).includes('WHERE "share"."projectId" = EXCLUDED."projectId"'))).toBe(true)
  })

  it("does not re-enable restore-key access for an already claimed demo project", async () => {
    const queries: unknown[][] = []
    const db = {
      async query(...args: unknown[]) {
        queries.push(args)
        if (String(args[0]).includes('INSERT INTO "user"')) return { rows: [{ id: "admin_existing" }] }
        if (String(args[0]).includes('RETURNING "ownerId", "claimedAt"')) {
          return { rows: [{ ownerId: "admin_existing", claimedAt: new Date("2026-06-06T12:00:00.000Z") }] }
        }
        if (String(args[0]).includes('RETURNING "id"')) return { rows: [{ id: "seed_row" }] }
        return { rows: [] }
      },
    }

    await expect(
      seedBootstrap({
        db,
        env: {
          NODE_ENV: "test",
          SEED_ADMIN_EMAIL: "admin@example.com",
          SEED_ADMIN_NAME: "Admin",
          SEED_DEMO_BASE_DATE: "2026-06-06T10:15:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ claimed: true })

    expect(queries.some(([sql]) => String(sql).includes('INSERT INTO "project_access_token"'))).toBe(false)
    const timerInsert = queries.find(([sql]) => String(sql).includes('INSERT INTO "timer"'))
    expect((timerInsert?.[1] as unknown[] | undefined)?.[2]).toBe("admin_existing")
  })

  it("rolls back when a seed row id collides outside the demo project", async () => {
    const queries: unknown[][] = []
    const db = {
      async query(...args: unknown[]) {
        queries.push(args)
        const sql = String(args[0])
        if (sql.includes('INSERT INTO "user"')) return { rows: [{ id: "admin_existing" }] }
        if (sql.includes('RETURNING "ownerId", "claimedAt"')) {
          return { rows: [{ ownerId: null, claimedAt: null }] }
        }
        if (sql.includes('INSERT INTO "space"')) return { rows: [] }
        if (sql.includes('RETURNING "id"')) return { rows: [{ id: "seed_row" }] }
        return { rows: [] }
      },
    }

    await expect(
      seedBootstrap({
        db,
        env: {
          NODE_ENV: "test",
          SEED_ADMIN_EMAIL: "admin@example.com",
          SEED_ADMIN_NAME: "Admin",
        },
      }),
    ).rejects.toThrow("Seed space id collision outside demo project")

    expect(queries.at(-1)?.[0]).toBe("ROLLBACK")
  })
})
