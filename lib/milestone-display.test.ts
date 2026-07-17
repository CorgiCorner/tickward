import { describe, expect, it } from "vitest"

import { setActiveLocale } from "@/lib/i18n/active-locale"
import { formatElapsedSince } from "@/lib/milestone-display"

describe("formatElapsedSince", () => {
  it("uses the largest useful elapsed unit with localized plurals", () => {
    setActiveLocale("en")

    expect(formatElapsedSince("2026-06-02T08:00:00.000Z", Date.parse("2026-06-05T08:00:00.000Z"))).toBe("3 days")
    expect(formatElapsedSince("2024-06-05T08:00:00.000Z", Date.parse("2026-06-05T08:00:00.000Z"))).toBe("2 years")
  })

  it("rejects invalid and future anchors", () => {
    expect(formatElapsedSince("not-a-date", Date.parse("2026-06-05T08:00:00.000Z"))).toBeNull()
    expect(formatElapsedSince("2026-06-06T08:00:00.000Z", Date.parse("2026-06-05T08:00:00.000Z"))).toBeNull()
  })
})
