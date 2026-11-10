import { describe, expect, it } from "vitest"

import { trustedClientIp, UNKNOWN_CLIENT_IP } from "@/lib/client-ip.server"

function request(headers: Record<string, string>) {
  return new Request("https://example.com/api/auth/email-otp/send-verification-otp", { headers })
}

function env(values: Record<string, string>) {
  return values as unknown as NodeJS.ProcessEnv
}

describe("trustedClientIp", () => {
  const trusted = env({ TICKWARD_TRUST_PROXY_HEADERS: "true" })

  it("ignores every proxy header unless the deployment trusts its proxy", () => {
    const spoofed = request({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "1.2.3.5", "x-real-ip": "1.2.3.6" })
    expect(trustedClientIp(spoofed, env({}))).toBe(UNKNOWN_CLIENT_IP)
  })

  it("takes the rightmost X-Forwarded-For hop, not the client-supplied left side", () => {
    expect(trustedClientIp(request({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" }), trusted)).toBe("198.51.100.9")
  })

  it("reads only the configured header, so a client cannot inject another one", () => {
    const spoofed = request({
      "cf-connecting-ip": "1.2.3.4",
      "x-forwarded-for": "198.51.100.9",
      "x-real-ip": "1.2.3.5",
    })
    expect(trustedClientIp(spoofed, trusted)).toBe("198.51.100.9")

    const realIp = env({ TICKWARD_CLIENT_IP_HEADER: "x-real-ip", TICKWARD_TRUST_PROXY_HEADERS: "true" })
    expect(trustedClientIp(spoofed, realIp)).toBe("1.2.3.5")
  })

  it("refuses headers outside the allowlist and missing values", () => {
    const odd = env({ TICKWARD_CLIENT_IP_HEADER: "x-anything", TICKWARD_TRUST_PROXY_HEADERS: "true" })
    expect(trustedClientIp(request({ "x-anything": "1.2.3.4" }), odd)).toBe(UNKNOWN_CLIENT_IP)
    expect(trustedClientIp(request({}), trusted)).toBe(UNKNOWN_CLIENT_IP)
  })
})
