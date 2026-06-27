import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET, POST, __resetClientErrorRateLimit } from "@/app/api/internal/client-error/route"

function postRequest(body: string, ip: string) {
  return new Request("http://localhost/api/internal/client-error", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body,
  })
}

describe("client-error endpoint", () => {
  beforeEach(() => {
    __resetClientErrorRateLimit()
    vi.stubEnv("TICKWARD_TRUST_PROXY_HEADERS", "true")
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("accepts a valid report and logs it server-side", async () => {
    const res = await POST(postRequest(JSON.stringify({ kind: "react", message: "boom", digest: "abc" }), "1.1.1.1"))
    expect(res.status).toBe(204)
    expect(console.error).toHaveBeenCalledWith("[tickward] client-error", expect.stringContaining("boom"))
  })

  it("rejects an invalid payload", async () => {
    const res = await POST(postRequest(JSON.stringify({ kind: "nope" }), "2.2.2.2"))
    expect(res.status).toBe(400)
  })

  it("rejects malformed JSON", async () => {
    const res = await POST(postRequest("{not json", "3.3.3.3"))
    expect(res.status).toBe(400)
  })

  it("rejects oversized bodies", async () => {
    const res = await POST(postRequest(JSON.stringify({ kind: "react", message: "x".repeat(20000) }), "4.4.4.4"))
    expect(res.status).toBe(413)
  })

  it("throttles a single flooding client", async () => {
    for (let i = 0; i < 20; i += 1) {
      const ok = await POST(postRequest(JSON.stringify({ kind: "window", message: `m${i}` }), "9.9.9.9"))
      expect(ok.status).toBe(204)
    }
    const blocked = await POST(postRequest(JSON.stringify({ kind: "window", message: "again" }), "9.9.9.9"))
    expect(blocked.status).toBe(429)
  })

  it("does not accept GET", () => {
    expect(GET().status).toBe(405)
  })
})
