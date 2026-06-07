import { afterEach, describe, expect, it } from "vitest"

import { redirectToDocs, redirectToDocsSubpath } from "@/lib/docs-redirect.server"

describe("redirectToDocs", () => {
  const originalOrigin = process.env.TICKWARD_DOCS_ORIGIN

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.TICKWARD_DOCS_ORIGIN
    } else {
      process.env.TICKWARD_DOCS_ORIGIN = originalOrigin
    }
  })

  it("redirects to the configured docs origin and preserves query params", () => {
    process.env.TICKWARD_DOCS_ORIGIN = "https://docs.example.test"

    const res = redirectToDocs(new Request("https://app.example.test/docs/api?ref=agent"), "/api")

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://docs.example.test/api?ref=agent")
  })

  it("stays disabled until a docs origin is configured", async () => {
    process.env.TICKWARD_DOCS_ORIGIN = ""

    const res = redirectToDocs(new Request("https://app.example.test/docs"), "/")

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      error: { type: "not_found", message: "Documentation is not configured." },
    })
  })

  it("redirects root LLM files to the docs subpath", () => {
    const res = redirectToDocsSubpath(new Request("https://app.example.test/llms.txt?ref=agent"), "/llms.txt")

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://app.example.test/docs/llms.txt?ref=agent")
  })
})
