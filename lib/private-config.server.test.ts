import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getBetterAuthConfig,
  getDatabaseUrl,
  getDirectDatabaseUrl,
  getResendConfig,
  getWebPushConfig,
} from "@/lib/private-config.server"

describe("adapter config", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function clearOptionalAdapterEnv() {
    vi.stubEnv("BETTER_AUTH_URL", undefined)
    vi.stubEnv("BETTER_AUTH_SECRET", undefined)
    vi.stubEnv("DATABASE_URL", undefined)
    vi.stubEnv("DIRECT_URL", undefined)
    vi.stubEnv("RESEND_API_KEY", undefined)
    vi.stubEnv("RESEND_FROM", undefined)
    vi.stubEnv("RESEND_REPLY_TO", undefined)
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", undefined)
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", undefined)
  }

  it("returns null for optional adapter configs when no env is set", () => {
    clearOptionalAdapterEnv()

    expect(getBetterAuthConfig()).toBeNull()
    expect(getDatabaseUrl()).toBeNull()
    expect(getDirectDatabaseUrl()).toBeNull()
    expect(getResendConfig()).toBeNull()
    expect(getWebPushConfig()).toBeNull()
  })

  it("requires RESEND_FROM only when RESEND_API_KEY is configured", () => {
    clearOptionalAdapterEnv()
    vi.stubEnv("RESEND_API_KEY", " rk_test ")

    expect(() => getResendConfig()).toThrow("Missing required environment variable: RESEND_FROM")

    vi.stubEnv("RESEND_FROM", " Tickward <noreply@example.com> ")
    vi.stubEnv("RESEND_REPLY_TO", " contact@example.com ")
    expect(getResendConfig()).toEqual({
      apiKey: "rk_test",
      from: "Tickward <noreply@example.com>",
      replyTo: "contact@example.com",
    })
  })

  it("rejects partially configured auth and Web Push adapters", () => {
    clearOptionalAdapterEnv()
    vi.stubEnv("BETTER_AUTH_URL", " https://tickward.test ")
    expect(() => getBetterAuthConfig()).toThrow("Better Auth is partially configured. Missing: BETTER_AUTH_SECRET")

    clearOptionalAdapterEnv()
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", " public ")
    expect(() => getWebPushConfig()).toThrow("Web Push is partially configured. Missing: WEB_PUSH_VAPID_PRIVATE_KEY")
  })

  it("normalizes Better Auth, database, and Web Push config", () => {
    clearOptionalAdapterEnv()
    vi.stubEnv("BETTER_AUTH_URL", " https://tickward.test/auth ")
    vi.stubEnv("BETTER_AUTH_SECRET", " secret ")
    vi.stubEnv("DATABASE_URL", " database-url-placeholder ")
    vi.stubEnv("DIRECT_URL", " direct-url-placeholder ")
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", " public ")
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", " private ")

    expect(getBetterAuthConfig()).toEqual({ url: "https://tickward.test/auth", secret: "secret" })
    expect(getDatabaseUrl()).toBe("database-url-placeholder")
    expect(getDirectDatabaseUrl()).toBe("direct-url-placeholder")
    expect(getWebPushConfig()).toEqual({
      publicKey: "public",
      privateKey: "private",
      subject: "mailto:admin@example.com",
    })
  })
})
