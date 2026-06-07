import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DatePicker } from "@/components/ui/date-picker"

vi.mock("date-fns", () => ({
  format: () => "Jun 6, 2026",
  parseISO: (value: string) => new Date(`${value}T00:00:00.000Z`),
}))

describe("DatePicker", () => {
  it("normalizes the mobile native input for iOS Safari sizing", () => {
    render(<DatePicker value="2026-06-06" onChange={vi.fn()} />)

    const input = screen.getByDisplayValue("2026-06-06")
    expect(input).toHaveAttribute("type", "date")
    expect(input).toHaveClass("native-date-time-input", "h-9", "min-w-0", "max-w-full")
  })
})
