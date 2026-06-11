import { describe, expect, it } from "vitest"

import { repeatPreviewLabel } from "@/components/timer-form-sections"
import { upcomingOccurrences } from "@/lib/utils"

describe("repeatPreviewLabel", () => {
  it("keeps the compact format for same-year previews", () => {
    const dates = upcomingOccurrences("2026-06-11T14:30:00.000Z", "daily", "Europe/Warsaw", 3)

    expect(repeatPreviewLabel(dates, "Europe/Warsaw")).toBe("Jun 11, 16:30 -> Jun 12, 16:30 -> Jun 13, 16:30 ...")
  })

  it("shows the year for yearly previews so occurrences are distinguishable", () => {
    const dates = upcomingOccurrences("2026-06-11T14:30:00.000Z", "yearly", "Europe/Warsaw", 3)

    expect(repeatPreviewLabel(dates, "Europe/Warsaw")).toBe(
      "Jun 11, 2026, 16:30 -> Jun 11, 2027, 16:30 -> Jun 11, 2028, 16:30 ...",
    )
  })

  it("shows the year when a preview crosses a year boundary", () => {
    const dates = upcomingOccurrences("2026-11-15T12:00:00.000Z", "monthly", "UTC", 3)

    expect(repeatPreviewLabel(dates, "UTC")).toBe(
      "Nov 15, 2026, 12:00 -> Dec 15, 2026, 12:00 -> Jan 15, 2027, 12:00 ...",
    )
  })

  it("decides the year spread in the display timezone", () => {
    // Dec 31, 23:30 UTC is already Jan 1 in Warsaw, so the Warsaw preview stays within one year.
    const dates = upcomingOccurrences("2026-12-31T23:30:00.000Z", "daily", "Europe/Warsaw", 2)

    expect(repeatPreviewLabel(dates, "Europe/Warsaw")).toBe("Jan 1, 00:30 -> Jan 2, 00:30 ...")
    expect(repeatPreviewLabel(dates, "UTC")).toBe("Dec 31, 2026, 23:30 -> Jan 1, 2027, 23:30 ...")
  })
})
