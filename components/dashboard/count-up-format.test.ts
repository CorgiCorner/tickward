import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  countUpCalendarFormatAvailable,
  countUpCalendarLead,
  countUpCalendarParts,
  countUpFormatStorageKey,
  effectiveCountUpFormat,
  readCountUpFormat,
  spokenCountUp,
  storeCountUpFormat,
  useCountUpFormat,
} from "@/components/dashboard/count-up-format"

afterEach(() => {
  globalThis.localStorage.clear()
})

describe("count-up format storage", () => {
  it("defaults to total days and stores only the calendar choice", () => {
    expect(readCountUpFormat("timer-a")).toBe("days")

    storeCountUpFormat("timer-a", "calendar")
    expect(globalThis.localStorage.getItem(countUpFormatStorageKey("timer-a"))).toBe("calendar")
    expect(readCountUpFormat("timer-a")).toBe("calendar")
    expect(readCountUpFormat("timer-b")).toBe("days")

    storeCountUpFormat("timer-a", "days")
    expect(globalThis.localStorage.getItem(countUpFormatStorageKey("timer-a"))).toBeNull()
  })

  it("ignores unknown stored values", () => {
    globalThis.localStorage.setItem(countUpFormatStorageKey("timer-a"), "weeks")
    expect(readCountUpFormat("timer-a")).toBe("days")
  })

  it("keeps every hook for the same timer in step", () => {
    const first = renderHook(() => useCountUpFormat("timer-a"))
    const second = renderHook(() => useCountUpFormat("timer-a"))

    act(() => first.result.current[1]("calendar"))

    expect(first.result.current[0]).toBe("calendar")
    expect(second.result.current[0]).toBe("calendar")
  })
})

describe("count-up calendar parts", () => {
  it("reads elapsed parts on the timer's wall clock", () => {
    const nowMs = Date.parse("2026-11-10T16:12:44.000Z")
    expect(countUpCalendarParts("2023-04-20T16:00:00.000Z", "UTC", nowMs)).toEqual({
      years: 3,
      months: 6,
      days: 21,
      hours: 0,
      minutes: 12,
      seconds: 44,
    })
    // 23:30 UTC on Apr 30 is already May 1 in Warsaw, so a month has passed there.
    expect(
      countUpCalendarParts("2026-03-31T22:30:00.000Z", "Europe/Warsaw", Date.parse("2026-04-30T23:30:00.000Z")).months,
    ).toBe(1)
  })

  it("returns zero parts before the anchor and for invalid dates", () => {
    const zero = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 }
    expect(countUpCalendarParts("2030-01-01T00:00:00.000Z", "UTC", Date.parse("2026-01-01T00:00:00.000Z"))).toEqual(
      zero,
    )
    expect(countUpCalendarParts("not a date", "UTC", Date.parse("2026-01-01T00:00:00.000Z"))).toEqual(zero)
  })

  it("offers the calendar format only after a full month", () => {
    const base = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 }
    expect(countUpCalendarFormatAvailable({ ...base, days: 30 })).toBe(false)
    expect(countUpCalendarFormatAvailable({ ...base, months: 1 })).toBe(true)
    expect(effectiveCountUpFormat("calendar", { ...base, days: 12 })).toBe("days")
    expect(effectiveCountUpFormat("calendar", { ...base, years: 1 })).toBe("calendar")
    expect(effectiveCountUpFormat("days", { ...base, years: 1 })).toBe("days")
  })

  it("leads with the largest whole unit", () => {
    const base = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 }
    expect(countUpCalendarLead({ ...base, years: 3, months: 6, days: 21 })).toEqual({
      value: 3,
      unit: "years",
      rest: [
        { value: 6, unit: "months" },
        { value: 21, unit: "days" },
      ],
    })
    expect(countUpCalendarLead({ ...base, years: 3 })).toEqual({ value: 3, unit: "years", rest: [] })
    expect(countUpCalendarLead({ ...base, months: 4, days: 2 })).toEqual({
      value: 4,
      unit: "months",
      rest: [{ value: 2, unit: "days" }],
    })
  })
})

describe("spoken count-up", () => {
  const parts = { years: 3, months: 6, days: 21, hours: 0, minutes: 12, seconds: 44 }

  it("reads the total days with a grouped number and no clock", () => {
    expect(spokenCountUp("days", 1300, parts)).toBe("1,300 days")
    expect(spokenCountUp("days", 1, parts)).toBe("1 day")
  })

  it("reads years, months and days in the calendar format", () => {
    expect(spokenCountUp("calendar", 1300, parts)).toBe("3 years, 6 months, 21 days")
    expect(spokenCountUp("calendar", 1096, { ...parts, months: 0, days: 0 })).toBe("3 years")
  })
})
