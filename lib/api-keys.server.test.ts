import { describe, expect, it } from "vitest"

import {
  API_KEY_PREFIX,
  createApiKeyToken,
  hashApiKeyToken,
  normalizeApiKeyName,
  normalizeApiKeyPermission,
  readBearerApiKey,
} from "@/lib/api-keys.server"

describe("api key helpers", () => {
  it("generates prefixed secrets and stores only deterministic hashes", () => {
    const token = createApiKeyToken()

    expect(token.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(hashApiKeyToken(token)).toHaveLength(64)
    expect(hashApiKeyToken(token)).toBe(hashApiKeyToken(token))
    expect(hashApiKeyToken(token)).not.toContain(token)
  })

  it("normalizes public API key permissions and names", () => {
    expect(normalizeApiKeyPermission("read")).toBe("read")
    expect(normalizeApiKeyPermission("full_access")).toBe("full_access")
    expect(normalizeApiKeyPermission("write")).toBeNull()

    expect(normalizeApiKeyName(" Production ")).toBe("Production")
    expect(normalizeApiKeyName("")).toBeNull()
    expect(normalizeApiKeyName("x".repeat(81))).toBeNull()
  })

  it("reads bearer tokens from authorization headers", () => {
    expect(
      readBearerApiKey(new Request("https://tickward.test", { headers: { authorization: "Bearer tw_123" } })),
    ).toBe("tw_123")
    expect(
      readBearerApiKey(new Request("https://tickward.test", { headers: { authorization: "Basic nope" } })),
    ).toBeNull()
    expect(readBearerApiKey(new Request("https://tickward.test"))).toBeNull()
  })
})
