import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { useForm } from "react-hook-form"

import { TimerRemindersField } from "@/components/timer-reminders-field"
import type { TimerFormValues } from "@/lib/schemas/timer"

function isoDateDaysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function RemindersProbe(
  props: Readonly<{ date?: string; reminders?: Array<{ offsetMinutes: number }>; repeatEnabled?: boolean }>,
) {
  const form = useForm<TimerFormValues>({
    defaultValues: {
      label: "",
      description: "",
      url: "",
      date: props.date ?? isoDateDaysFromNow(30),
      time: "09:00",
      timezone: "UTC",
      notify: true,
      reminders: props.reminders ?? [],
      repeatEnabled: props.repeatEnabled ?? false,
      repeatType: "yearly",
      lastDay: false,
      spaceId: "",
      image: null,
    },
  })
  return <TimerRemindersField control={form.control} />
}

describe("TimerRemindersField", () => {
  it("adds and removes preset reminders", async () => {
    const user = userEvent.setup()
    render(<RemindersProbe />)

    await user.click(screen.getByRole("button", { name: /10 minutes before/ }))

    expect(screen.getByRole("button", { name: "Remove 10 minutes before" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Remove 10 minutes before" }))

    expect(screen.queryByRole("button", { name: "Remove 10 minutes before" })).not.toBeInTheDocument()
  })

  it("can restore an at-the-moment reminder after removing it", async () => {
    const user = userEvent.setup()
    render(<RemindersProbe reminders={[{ offsetMinutes: 0 }]} />)

    await user.click(screen.getByRole("button", { name: "Remove when it is due" }))
    await user.click(screen.getByRole("button", { name: "when it is due" }))

    expect(screen.getByRole("button", { name: "Remove when it is due" })).toBeVisible()
  })

  it("shows duplicate and limit messages inline", async () => {
    const user = userEvent.setup()
    render(<RemindersProbe />)

    await user.click(screen.getByRole("button", { name: "5 minutes before" }))
    await user.click(screen.getByRole("button", { name: "5 minutes before" }))

    expect(screen.getByText("That reminder is already added.")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "10 minutes before" }))
    await user.click(screen.getByRole("button", { name: "30 minutes before" }))
    await user.click(screen.getByRole("button", { name: "1 hour before" }))
    await user.click(screen.getByRole("button", { name: "1 day before" }))

    expect(screen.getByText("You can add up to 5 reminders.")).toBeVisible()
    expect(screen.getByRole("button", { name: /1 week before/ })).toBeDisabled()
  })

  it("adds a custom reminder after unit conversion", async () => {
    const user = userEvent.setup()
    render(<RemindersProbe />)

    await user.click(screen.getByRole("button", { name: "Custom..." }))
    await user.clear(screen.getByLabelText("Amount"))
    await user.type(screen.getByLabelText("Amount"), "2")
    await user.selectOptions(screen.getByLabelText("Unit"), "hours")
    await user.click(screen.getByRole("button", { name: "Add reminder" }))

    expect(screen.getByText("2 hours before")).toBeVisible()
  })

  it("cancels the custom editor and resets its state", async () => {
    const user = userEvent.setup()
    render(<RemindersProbe />)

    await user.click(screen.getByRole("button", { name: "Custom..." }))
    await user.clear(screen.getByLabelText("Amount"))
    await user.type(screen.getByLabelText("Amount"), "7")
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Custom..." }))

    expect(screen.getByLabelText("Amount")).toHaveValue(15)
  })

  it("warns when a reminder falls before now for a fixed date", async () => {
    const user = userEvent.setup()
    render(<RemindersProbe date={isoDateDaysFromNow(2)} />)

    await user.click(screen.getByRole("button", { name: /1 week before/ }))

    expect(screen.getByText(/fall before now/)).toBeVisible()
  })

  it("does not warn about past offsets when the timer repeats", async () => {
    const user = userEvent.setup()
    render(<RemindersProbe date={isoDateDaysFromNow(2)} repeatEnabled />)

    await user.click(screen.getByRole("button", { name: /1 week before/ }))

    expect(screen.queryByText(/fall before now/)).not.toBeInTheDocument()
  })
})
