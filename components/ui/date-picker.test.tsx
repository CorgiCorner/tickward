import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DatePicker, DatePresetChips } from "@/components/ui/date-picker"
import { setActiveLocale } from "@/lib/i18n/active-locale"

vi.mock("date-fns", () => ({
  format: () => "Jun 6, 2026",
  parseISO: (value: string) => new Date(`${value}T00:00:00.000Z`),
}))

describe("DatePicker", () => {
  beforeEach(() => {
    setActiveLocale("en")
  })

  it("normalizes the mobile native input for iOS Safari sizing", () => {
    render(<DatePicker value="2026-06-06" onChange={vi.fn()} />)

    const input = screen.getByDisplayValue("2026-06-06")
    expect(input).toHaveAttribute("type", "date")
    expect(input).toHaveClass("native-date-time-input", "h-9", "min-w-0", "max-w-full")
  })
})

describe("DatePresetChips", () => {
  beforeEach(() => {
    setActiveLocale("en")
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 5, 9, 30, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ["Tomorrow", "2026-06-06"],
    ["In 7 days", "2026-06-12"],
    ["In 14 days", "2026-06-19"],
  ])("sets %s from the local current date", (label, expectedDate) => {
    const onChange = vi.fn()
    render(<DatePresetChips onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: label }))

    expect(onChange).toHaveBeenCalledWith(expectedDate)
  })

  it.each([
    ["Yesterday", "2026-06-04"],
    ["7 days ago", "2026-05-29"],
    ["14 days ago", "2026-05-22"],
  ])("sets %s from the local current date for since timers", (label, expectedDate) => {
    const onChange = vi.fn()
    render(<DatePresetChips direction="past" onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: label }))

    expect(onChange).toHaveBeenCalledWith(expectedDate)
  })
})
