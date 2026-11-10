import { createHash } from "node:crypto"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
}))

vi.mock("@/lib/rate-limit.server", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}))

const SEND_URL = "https://example.com/api/auth/email-otp/send-verification-otp"

function sendRequest(headers: Record<string, string>, body: unknown) {
  return new Request(SEND_URL, { method: "POST", headers, body: JSON.stringify(body) })
}

function ipKey(ip: string) {
  return `ip:${createHash("sha256").update(ip, "utf8").digest("hex")}`
}

describe("email OTP send rate limit", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset()
    mocks.enforceRateLimit.mockResolvedValue(null)
    vi.stubEnv("TICKWARD_TRUST_PROXY_HEADERS", "true")
    vi.stubEnv("TRUST_PROXY_HEADERS", "")
    vi.stubEnv("TICKWARD_CLIENT_IP_HEADER", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("identifies Better Auth email OTP send requests", async () => {
    const { isEmailOtpSendRequest } = await import("./email-otp-rate-limit.server")

    expect(isEmailOtpSendRequest(new Request(SEND_URL))).toBe(true)
    expect(isEmailOtpSendRequest(new Request("https://example.com/api/auth/get-session"))).toBe(false)
  })

  it("rate limits valid email payloads by normalized email hash", async () => {
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await expect(
      enforceEmailOtpSendRateLimit(
        sendRequest({ "x-forwarded-for": "203.0.113.10" }, { email: " Ada@Example.com ", type: "sign-in" }),
      ),
    ).resolves.toBeNull()

    const expectedHash = createHash("sha256").update("ada@example.com", "utf8").digest("hex")
    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(1, "auth-otp-ip", ipKey("203.0.113.10"))
    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(2, "auth-otp", `email:${expectedHash}`)
  })

  it("keys the per-IP bucket on the hop the trusted proxy appended, not on client-supplied headers", async () => {
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    for (const spoofed of ["1.2.3.4", "1.2.3.5", "1.2.3.6"]) {
      await enforceEmailOtpSendRateLimit(
        sendRequest(
          { "cf-connecting-ip": spoofed, "x-forwarded-for": `${spoofed}, 198.51.100.9`, "x-real-ip": spoofed },
          { email: "ada@example.com" },
        ),
      )
    }

    const ipKeys = mocks.enforceRateLimit.mock.calls
      .filter(([bucket]) => bucket === "auth-otp-ip")
      .map(([, key]) => key)
    expect(ipKeys).toEqual([ipKey("198.51.100.9"), ipKey("198.51.100.9"), ipKey("198.51.100.9")])
  })

  it("ignores untrusted proxy headers and spends the email budget before the shared ceiling", async () => {
    vi.stubEnv("TICKWARD_TRUST_PROXY_HEADERS", "")
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await enforceEmailOtpSendRateLimit(
      sendRequest({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "1.2.3.5" }, { email: "ada@example.com" }),
    )

    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(1, "auth-otp", expect.stringMatching(/^email:/))
    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(2, "auth-otp-unknown-ip", "all")
    expect(mocks.enforceRateLimit.mock.calls.some(([bucket]) => bucket === "auth-otp-ip")).toBe(false)
  })

  it("does not let one address hammering the route block code emails to another address", async () => {
    vi.stubEnv("TICKWARD_TRUST_PROXY_HEADERS", "")
    const counts = new Map<string, number>()
    mocks.enforceRateLimit.mockImplementation(async (bucket, key) => {
      const entry = `${bucket}:${key}`
      const count = (counts.get(entry) ?? 0) + 1
      counts.set(entry, count)
      const limit = bucket === "auth-otp" ? 1 : 30
      return count > limit ? Response.json({}, { status: 429 }) : null
    })
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")
    for (let i = 0; i < 50; i++) await enforceEmailOtpSendRateLimit(sendRequest({}, { email: " NOISY@example.com " }))
    for (let i = 0; i < 50; i++) await enforceEmailOtpSendRateLimit(sendRequest({}, { email: "not-email" }))
    expect(await enforceEmailOtpSendRateLimit(sendRequest({}, { email: "other@example.org" }))).toBeNull()
    expect(counts.get("auth-otp-unknown-ip:all")).toBe(2)
  })

  it("still caps unknown-IP sends across addresses with the shared ceiling", async () => {
    vi.stubEnv("TICKWARD_TRUST_PROXY_HEADERS", "")
    const limited = Response.json({ error: "limited" }, { status: 429 })
    mocks.enforceRateLimit.mockImplementation(async (bucket) => (bucket === "auth-otp-unknown-ip" ? limited : null))
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await expect(enforceEmailOtpSendRateLimit(sendRequest({}, { email: "fresh@example.org" }))).resolves.toBe(limited)
  })

  it("rate limits by IP before reading the email bucket", async () => {
    const limited = Response.json({ error: "limited" }, { status: 429 })
    mocks.enforceRateLimit.mockResolvedValueOnce(limited)
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await expect(
      enforceEmailOtpSendRateLimit(sendRequest({ "x-forwarded-for": "203.0.113.20" }, { email: "ada@example.com" })),
    ).resolves.toBe(limited)

    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("auth-otp-ip", ipKey("203.0.113.20"))
  })

  it("lets Better Auth handle invalid email payloads after the IP limit passes", async () => {
    const { enforceEmailOtpSendRateLimit } = await import("./email-otp-rate-limit.server")

    await expect(
      enforceEmailOtpSendRateLimit(sendRequest({ "x-forwarded-for": "203.0.113.30" }, { email: "not-email" })),
    ).resolves.toBeNull()

    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("auth-otp-ip", ipKey("203.0.113.30"))
  })
})
