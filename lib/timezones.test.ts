import { beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_TIMEZONE_STORAGE_KEY, getDefaultTimeZone, isSupportedTimeZone } from "@/lib/timezones"

describe("timezones", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("uses a valid stored default timezone", () => {
    localStorage.setItem(DEFAULT_TIMEZONE_STORAGE_KEY, "America/New_York")

    expect(getDefaultTimeZone()).toBe("America/New_York")
  })

  it("ignores invalid stored default timezone values", () => {
    localStorage.setItem(DEFAULT_TIMEZONE_STORAGE_KEY, "not/a-zone")

    expect(getDefaultTimeZone()).not.toBe("not/a-zone")
  })

  it("validates IANA timezone values through Intl", () => {
    expect(isSupportedTimeZone("Europe/Warsaw")).toBe(true)
    expect(isSupportedTimeZone("not/a-zone")).toBe(false)
  })
})
