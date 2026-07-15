import { afterEach, describe, expect, it, vi } from "vitest"

import { databasePoolConfig } from "./pool-config"

describe("databasePoolConfig", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("uses conservative SSR defaults", () => {
    expect(databasePoolConfig({})).toEqual({
      application_name: "tickward-ssr",
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      max: 5,
    })
  })

  it("parses deployment overrides", () => {
    expect(
      databasePoolConfig({
        DATABASE_APPLICATION_NAME: "tickward-preview",
        DATABASE_CONNECT_TIMEOUT_MS: "3000",
        DATABASE_IDLE_TIMEOUT_MS: "15000",
        DATABASE_POOL_MAX: "3",
      }),
    ).toEqual({
      application_name: "tickward-preview",
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 15_000,
      max: 3,
    })
  })

  it("reads deployment overrides from the process environment by default", () => {
    vi.stubEnv("DATABASE_APPLICATION_NAME", "tickward-worker")
    vi.stubEnv("DATABASE_CONNECT_TIMEOUT_MS", "4000")
    vi.stubEnv("DATABASE_IDLE_TIMEOUT_MS", "20000")
    vi.stubEnv("DATABASE_POOL_MAX", "4")

    expect(databasePoolConfig()).toEqual({
      application_name: "tickward-worker",
      connectionTimeoutMillis: 4_000,
      idleTimeoutMillis: 20_000,
      max: 4,
    })
  })

  it.each([
    ["DATABASE_POOL_MAX", "0"],
    ["DATABASE_POOL_MAX", "21"],
    ["DATABASE_CONNECT_TIMEOUT_MS", "fast"],
    ["DATABASE_IDLE_TIMEOUT_MS", "999"],
    ["DATABASE_APPLICATION_NAME", "Tickward SSR"],
  ] as const)("rejects invalid %s", (name, value) => {
    expect(() => databasePoolConfig({ [name]: value })).toThrow(name)
  })
})
