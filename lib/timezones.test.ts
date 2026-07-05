import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_TIMEZONE_STORAGE_KEY,
  getBrowserTimeZone,
  getDefaultTimeZone,
  isSupportedTimeZone,
  normalizeTimeZone,
} from "@/lib/timezones"

describe("timezones", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it("normalizes zones the runtime cannot resolve to UTC", () => {
    expect(normalizeTimeZone("Europe/Warsaw")).toBe("Europe/Warsaw")
    expect(normalizeTimeZone("not/a-zone")).toBe("UTC")
  })

  it("falls back to UTC when the browser reports a zone Intl rejects as input", () => {
    const resolved = Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...resolved,
      timeZone: "Etc/Unknown",
    })

    expect(getBrowserTimeZone()).toBe("UTC")
    expect(getDefaultTimeZone()).toBe("UTC")
  })

  it("keeps a browser-reported zone that Intl accepts", () => {
    const resolved = Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...resolved,
      timeZone: "Europe/Warsaw",
    })

    expect(getBrowserTimeZone()).toBe("Europe/Warsaw")
  })
})
