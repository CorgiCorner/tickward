import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TimerAlarmOverlay } from "@/components/timer-alarm-overlay"

describe("TimerAlarmOverlay", () => {
  it("stays hidden without an active full-page alarm", () => {
    render(<TimerAlarmOverlay alarm={null} onDismiss={vi.fn()} />)

    expect(screen.queryByText("Timer finished")).not.toBeInTheDocument()
  })

  it("shows the timer label and can be dismissed", async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(
      <TimerAlarmOverlay
        alarm={{
          timerId: "timer-a",
          label: "Deploy",
          boundary: "2026-05-24T00:00:00.000Z",
          fullPageAlarm: true,
        }}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByText("Timer finished")).toBeInTheDocument()
    expect(screen.getByText("Deploy")).toBeInTheDocument()
    expect(screen.getByRole("alertdialog")).toHaveClass("z-[100]")

    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
