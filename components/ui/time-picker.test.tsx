import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { TimePicker } from "@/components/ui/time-picker"

describe("TimePicker", () => {
  it("normalizes the mobile native input for iOS Safari sizing", () => {
    render(<TimePicker value="08:30" onChange={vi.fn()} />)

    const input = screen.getByDisplayValue("08:30")
    expect(input).toHaveAttribute("type", "time")
    expect(input).toHaveClass("native-date-time-input", "h-9", "min-w-0", "max-w-full")
  })
})
