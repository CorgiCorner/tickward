import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DurationPicker,
  ScheduleModeToggle,
  TimePicker,
  formatDurationCompact,
  valueFromTotalSeconds,
} from "@/components/ui/time-picker"
import { setActiveLocale } from "@/lib/i18n/active-locale"

vi.mock("@/components/use-now", () => ({
  useNow: () => new Date("2026-06-05T08:00:00.000Z").getTime(),
}))

describe("formatDurationCompact", () => {
  beforeEach(() => {
    setActiveLocale("en")
  })

  it("formats whole days with the localized compact day label", () => {
    expect(
      formatDurationCompact({
        durationDays: "02",
        durationHours: "00",
        durationMinutes: "00",
        durationSeconds: "00",
      }),
    ).toBe("2 d")

    setActiveLocale("pl")
    expect(
      formatDurationCompact({
        durationDays: "02",
        durationHours: "00",
        durationMinutes: "00",
        durationSeconds: "00",
      }),
    ).toBe("2 dni")
  })

  it("formats the Polish singular compact day label", () => {
    setActiveLocale("pl")

    expect(
      formatDurationCompact({
        durationDays: "01",
        durationHours: "00",
        durationMinutes: "00",
        durationSeconds: "00",
      }),
    ).toBe("1 dzień")
  })

  it("formats days with a compact sub-day remainder", () => {
    expect(
      formatDurationCompact({
        durationDays: "01",
        durationHours: "02",
        durationMinutes: "30",
        durationSeconds: "00",
      }),
    ).toBe("1 d 2:30:00")
  })

  it("keeps sub-day formatting unchanged", () => {
    expect(
      formatDurationCompact({
        durationDays: "00",
        durationHours: "01",
        durationMinutes: "02",
        durationSeconds: "03",
      }),
    ).toBe("1:02:03")
  })
})

describe("valueFromTotalSeconds", () => {
  it("rolls full days into the day segment", () => {
    expect(valueFromTotalSeconds(172800)).toEqual({
      durationDays: "02",
      durationHours: "00",
      durationMinutes: "00",
      durationSeconds: "00",
    })
  })
})

describe("DurationPicker", () => {
  beforeEach(() => {
    setActiveLocale("en")
  })

  it("includes the calendar date in the ends-at preview for multi-day durations", () => {
    render(
      <DurationPicker
        value={{
          durationDays: "07",
          durationHours: "00",
          durationMinutes: "00",
          durationSeconds: "00",
        }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/Ends at Jun 12,/)).toBeVisible()
  })
})

describe("ScheduleModeToggle", () => {
  beforeEach(() => {
    setActiveLocale("en")
  })

  it("exposes the mode toggle as a native group with pressable buttons", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<ScheduleModeToggle value="at" onChange={onChange} />)

    const group = screen.getByRole("group", { name: "Schedule" })
    expect(group.tagName).toBe("FIELDSET")
    expect(screen.getByRole("button", { name: "Date & time" })).toHaveAttribute("aria-pressed", "true")

    const durationButton = screen.getByRole("button", { name: "Duration" })
    expect(durationButton).toHaveAttribute("aria-pressed", "false")

    await user.click(durationButton)
    expect(onChange).toHaveBeenCalledWith("in")
  })
})

describe("TimePicker", () => {
  it("normalizes the mobile native input for iOS Safari sizing", () => {
    render(<TimePicker value="08:30" onChange={vi.fn()} />)

    const input = screen.getByDisplayValue("08:30")
    expect(input).toHaveAttribute("type", "time")
    expect(input).toHaveClass("native-date-time-input", "h-9", "min-w-0", "max-w-full")
  })
})
