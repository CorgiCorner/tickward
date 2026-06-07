import { describe, expect, it, vi } from "vitest"

import {
  classifyRedisKey,
  hashRestoreKeyToken,
  isProjectSnapshot,
  migrateRedisToPostgres,
  parseRedisValue,
} from "./migrate-redis-to-postgres.mjs"

describe("redis to postgres migration script", () => {
  it("classifies legacy Redis storage keys", () => {
    expect(classifyRedisKey("project:restoreKey_123")).toEqual({ kind: "project", id: "restoreKey_123" })
    expect(classifyRedisKey("share:timer:shareId_123")).toBeNull()
    expect(classifyRedisKey("share:space:spaceId_123")).toBeNull()
    expect(classifyRedisKey("project:bad")).toBeNull()
    expect(classifyRedisKey("ratelimit:restoreKey_123")).toBeNull()
  })

  it("hashes restore keys without storing raw tokens", () => {
    expect(hashRestoreKeyToken("restoreKey_123")).toMatch(/^[a-f0-9]{64}$/)
    expect(hashRestoreKeyToken("restoreKey_123")).not.toContain("restoreKey_123")
  })

  it("validates and parses Redis JSON payloads", () => {
    const project = {
      version: 2,
      name: "Project",
      timers: [],
      spaces: [],
      updatedAt: "2026-06-05T12:00:00.000Z",
    }

    expect(parseRedisValue(JSON.stringify(project))).toEqual(project)
    expect(isProjectSnapshot(project)).toBe(true)
    expect(isProjectSnapshot({ ...project, version: 1 })).toBe(false)
  })

  it("dry-runs project migration without opening Postgres", async () => {
    const project = {
      version: 2,
      name: "Project",
      timers: [],
      spaces: [],
      updatedAt: "2026-06-05T12:00:00.000Z",
    }
    const scan = vi.fn().mockResolvedValueOnce(["0", ["project:restoreKey_123"]])
    const mget = vi.fn().mockResolvedValueOnce([project])

    await expect(migrateRedisToPostgres({ redis: { scan, mget }, write: false, batchSize: 10 })).resolves.toEqual({
      project: { scanned: 1, migrated: 1, skipped: 0, failed: 0 },
    })
    expect(mget).toHaveBeenCalledTimes(1)
  })
})
