import { afterEach, describe, expect, it } from "vitest"

import { contentSecurityPolicy } from "@/lib/security-headers"

const originalSentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN

function restoreEnv(name: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = original
}

describe("contentSecurityPolicy", () => {
  afterEach(() => {
    restoreEnv("NEXT_PUBLIC_SENTRY_DSN", originalSentryDsn)
  })

  it("allows the Sentry browser CDN in connect-src when a DSN is configured", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public-key@o123.ingest.us.sentry.io/4567"

    expect(contentSecurityPolicy()).toMatch(/connect-src[^;]*https:\/\/browser\.sentry-cdn\.com/)
  })

  it("omits the Sentry browser CDN when no DSN is configured", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN

    expect(contentSecurityPolicy()).not.toContain("browser.sentry-cdn.com")
  })
})
