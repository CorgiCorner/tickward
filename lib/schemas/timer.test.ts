import { describe, expect, it } from "vitest"

import { normalizeTimerUrl } from "@/lib/schemas/timer"

describe("normalizeTimerUrl", () => {
  it("returns an empty string for blank input", () => {
    expect(normalizeTimerUrl("")).toBe("")
    expect(normalizeTimerUrl("   ")).toBe("")
  })

  it("keeps a clean http(s) URL", () => {
    expect(normalizeTimerUrl("https://example.com/path")).toBe("https://example.com/path")
    expect(normalizeTimerUrl("  http://example.com/a  ")).toBe("http://example.com/a")
  })

  it("strips query strings and fragments", () => {
    expect(normalizeTimerUrl("https://example.com/p?a=1&b=2")).toBe("https://example.com/p")
    expect(normalizeTimerUrl("https://example.com/p#section")).toBe("https://example.com/p")
    expect(normalizeTimerUrl("https://example.com/p?x=1#y")).toBe("https://example.com/p")
  })

  it("rejects non-http(s) schemes (XSS-safe)", () => {
    expect(normalizeTimerUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeTimerUrl("data:text/html,<script>")).toBeNull()
    expect(normalizeTimerUrl("ftp://example.com")).toBeNull()
  })

  it("rejects values that are not absolute URLs", () => {
    expect(normalizeTimerUrl("example.com")).toBeNull()
    expect(normalizeTimerUrl("/relative/path")).toBeNull()
    expect(normalizeTimerUrl("not a url")).toBeNull()
  })
})
