import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function SelectFixture() {
  const [value, setValue] = useState("one")
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="Review policy">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="one">First option</SelectItem>
        <SelectItem value="two">Second option</SelectItem>
      </SelectContent>
    </Select>
  )
}

describe("Select", () => {
  it("opens a styled listbox and changes the selected value", async () => {
    const user = userEvent.setup()
    render(<SelectFixture />)

    const trigger = screen.getByRole("combobox", { name: "Review policy" })
    expect(trigger).toHaveTextContent("First option")
    expect(trigger).toHaveAttribute("data-slot", "select-trigger")

    await user.click(trigger)
    await user.click(screen.getByRole("option", { name: "Second option" }))

    expect(trigger).toHaveTextContent("Second option")
  })
})
