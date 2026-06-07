import { afterEach, describe, expect, it, vi } from "vitest"
import { optionalServerEnv, requireServerEnv } from "./env.server"

describe("requireServerEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns the trimmed value when present", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "  https://redis.example  ")
    expect(requireServerEnv("UPSTASH_REDIS_REST_URL")).toBe("https://redis.example")
  })

  it("throws with the exact message when missing", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined)
    expect(() => requireServerEnv("UPSTASH_REDIS_REST_TOKEN")).toThrow(
      "Missing required environment variable: UPSTASH_REDIS_REST_TOKEN",
    )
  })

  it("throws when empty after trimming", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "   ")
    expect(() => requireServerEnv("UPSTASH_REDIS_REST_URL")).toThrow(
      "Missing required environment variable: UPSTASH_REDIS_REST_URL",
    )
  })
})

describe("optionalServerEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns the trimmed value when present", () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "  access-key  ")
    expect(optionalServerEnv("UNSPLASH_ACCESS_KEY")).toBe("access-key")
  })

  it("returns undefined when missing", () => {
    vi.stubEnv("DATABASE_URL", undefined)
    expect(optionalServerEnv("DATABASE_URL")).toBeUndefined()
  })

  it("returns undefined when empty after trimming", () => {
    vi.stubEnv("RESEND_API_KEY", "   ")
    expect(optionalServerEnv("RESEND_API_KEY")).toBeUndefined()
  })
})
