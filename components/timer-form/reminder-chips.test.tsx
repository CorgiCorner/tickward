import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm, useWatch, type Control } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"

import {
  COUNTDOWN_REMINDER_PRESETS,
  COUNT_UP_REMINDER_PRESETS,
  TimerReminderChips,
  customReminderOffsetMinutes,
} from "@/components/timer-form/reminder-chips"
import { REMINDER_OFFSET_MAX_MINUTES, timerReminderSchema, type TimerFormValues } from "@/lib/schemas/timer"

vi.mock("@/components/use-now", () => ({
  useNow: () => new Date("2026-06-05T08:00:00.000Z").getTime(),
}))

function Values(props: Readonly<{ control: Control<TimerFormValues> }>) {
  const reminders = useWatch({ control: props.control, name: "reminders" })
  return <output aria-label="Saved reminders">{JSON.stringify(reminders)}</output>
}

function Harness(
  props: Readonly<{
    reminders?: Array<{ offsetMinutes: number }>
    timerMode?: TimerFormValues["timerMode"]
    disabled?: boolean
  }>,
) {
  const form = useForm<TimerFormValues>({
    defaultValues: {
      reminders: props.reminders ?? [],
      timerMode: props.timerMode ?? "until",
      scheduleMode: "at",
      date: "2026-07-01",
      time: "09:00",
      timezone: "UTC",
      repeatEnabled: false,
      repeatType: "yearly",
      lastDay: false,
      milestoneRules: props.timerMode === "since" ? [{ unit: "years", every: 1 }] : [],
    },
  })
  return (
    <>
      <TimerReminderChips control={form.control} timerMode={props.timerMode ?? "until"} disabled={props.disabled} />
      <Values control={form.control} />
    </>
  )
}

function saved() {
  return JSON.parse(screen.getByLabelText("Saved reminders").textContent ?? "[]") as Array<{ offsetMinutes: number }>
}

describe("reminder presets", () => {
  it.each([...COUNTDOWN_REMINDER_PRESETS, ...COUNT_UP_REMINDER_PRESETS])(
    "offers %i minutes only because the timer schema accepts it",
    (offsetMinutes) => {
      expect(timerReminderSchema.safeParse({ offsetMinutes }).success).toBe(true)
    },
  )

  it("matches the countdown presets on the board", () => {
    expect([...COUNTDOWN_REMINDER_PRESETS]).toEqual([10_080, 1440, 60, 10])
  })

  it("accepts custom offsets inside the scheduler range only", () => {
    expect(customReminderOffsetMinutes("2", "hours")).toBe(120)
    expect(customReminderOffsetMinutes("4", "weeks")).toBe(REMINDER_OFFSET_MAX_MINUTES)
    expect(customReminderOffsetMinutes("5", "weeks")).toBeNull()
    expect(customReminderOffsetMinutes("1.5", "hours")).toBeNull()
    expect(customReminderOffsetMinutes("-1", "minutes")).toBeNull()
    expect(customReminderOffsetMinutes("", "minutes")).toBeNull()
  })
})

describe("TimerReminderChips", () => {
  it("shows the countdown presets as toggles before the date", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const names = screen.getAllByRole("button").map((button) => button.textContent)
    expect(names).toEqual(["1 week before", "1 day before", "1 hour before", "10 minutes before", "Custom..."])

    const dayBefore = screen.getByRole("button", { name: "1 day before" })
    expect(dayBefore).toHaveAttribute("aria-pressed", "false")
    await user.click(dayBefore)
    await user.click(screen.getByRole("button", { name: "10 minutes before" }))
    expect(dayBefore).toHaveAttribute("aria-pressed", "true")
    expect(saved()).toEqual([{ offsetMinutes: 1440 }, { offsetMinutes: 10 }])

    await user.click(dayBefore)
    expect(dayBefore).toHaveAttribute("aria-pressed", "false")
    expect(saved()).toEqual([{ offsetMinutes: 10 }])
  })

  it("keeps offsets that are not presets as selected chips", async () => {
    const user = userEvent.setup()
    render(<Harness reminders={[{ offsetMinutes: 0 }, { offsetMinutes: 30 }]} />)

    expect(screen.getByRole("button", { name: "when it is due" })).toHaveAttribute("aria-pressed", "true")
    const halfHour = screen.getByRole("button", { name: "30 minutes before" })
    expect(halfHour).toHaveAttribute("aria-pressed", "true")

    await user.click(halfHour)

    expect(saved()).toEqual([{ offsetMinutes: 0 }])
    expect(screen.queryByRole("button", { name: "30 minutes before" })).not.toBeInTheDocument()
  })

  it("stops at five reminders and says why", () => {
    render(
      <Harness
        reminders={[
          { offsetMinutes: 10_080 },
          { offsetMinutes: 1440 },
          { offsetMinutes: 60 },
          { offsetMinutes: 5 },
          { offsetMinutes: 30 },
        ]}
      />,
    )

    expect(screen.getByRole("button", { name: "10 minutes before" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Custom..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "1 day before" })).toBeEnabled()
    expect(screen.getByText("You can add up to 5 reminders.")).toBeVisible()
  })

  it("adds a custom offset with the shared select", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "Custom..." }))
    expect(document.querySelector("select")).toBeNull()
    const amount = screen.getByLabelText("Amount")
    await user.clear(amount)
    await user.type(amount, "2")
    await user.click(screen.getByRole("combobox", { name: "Unit" }))
    await user.click(screen.getByRole("option", { name: "Hours" }))
    await user.click(screen.getByRole("button", { name: "Add reminder" }))

    expect(saved()).toEqual([{ offsetMinutes: 120 }])
    expect(screen.getByRole("button", { name: "2 hours before" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument()
  })

  it("rejects custom offsets the scheduler would not accept", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "Custom..." }))
    await user.clear(screen.getByLabelText("Amount"))
    await user.type(screen.getByLabelText("Amount"), "50000")
    await user.click(screen.getByRole("button", { name: "Add reminder" }))

    expect(screen.getByText("Use a whole number up to 4 weeks.")).toBeVisible()
    expect(saved()).toEqual([])
  })

  it("rejects a custom offset that is already selected", async () => {
    const user = userEvent.setup()
    render(<Harness reminders={[{ offsetMinutes: 60 }]} />)

    await user.click(screen.getByRole("button", { name: "Custom..." }))
    await user.clear(screen.getByLabelText("Amount"))
    await user.type(screen.getByLabelText("Amount"), "1")
    await user.click(screen.getByRole("combobox", { name: "Unit" }))
    await user.click(screen.getByRole("option", { name: "Hours" }))
    await user.click(screen.getByRole("button", { name: "Add reminder" }))

    expect(screen.getByText("That reminder is already added.")).toBeVisible()
    expect(saved()).toEqual([{ offsetMinutes: 60 }])
  })

  it("uses milestone copy for count-up timers", () => {
    render(<Harness timerMode="since" reminders={[{ offsetMinutes: 0 }]} />)

    const names = screen.getAllByRole("button").map((button) => button.textContent)
    expect(names).toEqual(["On the milestone", "1 day before", "1 week before", "Custom..."])
    expect(screen.queryByText("when it is due")).not.toBeInTheDocument()
  })

  it("highlights reminders that would fall before now", () => {
    render(<Harness reminders={[{ offsetMinutes: 40_320 }]} />)

    expect(screen.getByRole("button", { name: "4 weeks before" })).toHaveAttribute("data-reminder-past", "true")
    expect(
      screen.getByText("Highlighted reminders fall before now, so they won't be sent for this date."),
    ).toBeVisible()
  })

  it("switches every chip off while reminders cannot be sent", () => {
    render(<Harness disabled reminders={[{ offsetMinutes: 1440 }]} />)

    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled()
    expect(screen.getByRole("button", { name: "1 day before" })).toHaveAttribute("aria-pressed", "true")
  })
})
