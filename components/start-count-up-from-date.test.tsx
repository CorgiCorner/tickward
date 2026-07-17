import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { StartCountUpFromDate } from "@/components/start-count-up-from-date"
import { setActiveLocale } from "@/lib/i18n/active-locale"
import type { TimerStore } from "@/lib/store"
import { makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

vi.mock("@/components/use-now", () => ({
  useNow: () => new Date("2026-06-05T08:00:00.000Z").getTime(),
}))

vi.mock("sonner", () => ({ toast: toastMock }))

function pastTimer() {
  return makeTimer({
    id: "timer-a",
    label: "Together",
    targetDate: "2026-06-02T08:00:00.000Z",
    timezone: "Europe/Warsaw",
    color: "#336699",
    spaceId: "space-a",
    reminders: [{ offsetMinutes: 30 }],
  })
}

describe("StartCountUpFromDate", () => {
  beforeEach(() => {
    setActiveLocale("en")
    toastMock.mockReset()
    toastMock.error.mockReset()
    storeState = {
      addTimer: vi.fn(() => true),
      archiveTimer: vi.fn(),
      removeTimer: vi.fn(),
      unarchiveTimer: vi.fn(),
    }
  })

  it("only offers the action for past countdowns", () => {
    const { rerender } = render(<StartCountUpFromDate timer={pastTimer()} />)
    expect(screen.getByRole("button", { name: "Start counting up from this date" })).toBeVisible()

    rerender(<StartCountUpFromDate timer={makeTimer({ targetDate: "2026-06-06T08:00:00.000Z" })} />)
    expect(screen.queryByRole("button", { name: "Start counting up from this date" })).not.toBeInTheDocument()

    rerender(
      <StartCountUpFromDate
        timer={makeTimer({
          ...pastTimer(),
          mode: "since",
          milestones: { rules: [{ unit: "years", every: 1 }] },
        })}
      />,
    )
    expect(screen.queryByRole("button", { name: "Start counting up from this date" })).not.toBeInTheDocument()
  })

  it("shows the resolved anchor, elapsed time, effects, and shared milestone presets before creation", async () => {
    const user = userEvent.setup()
    render(<StartCountUpFromDate timer={pastTimer()} />)

    await user.click(screen.getByRole("button", { name: "Start counting up from this date" }))

    expect(screen.getByRole("dialog", { name: "Start a new count-up timer" })).toBeVisible()
    expect(screen.getByText("Counting from Jun 2, 2026 · 10:00 — 3 days ago")).toBeVisible()
    expect(screen.getByText("A new count-up timer with the same label, space, and color.")).toBeVisible()
    expect(
      screen.getByText(
        "A celebration reminder at each milestone is included. Additional reminders can be edited later.",
      ),
    ).toBeVisible()
    expect(screen.getByRole("radio", { name: "Archive the countdown (recommended)" })).toBeChecked()
    expect(screen.getByText("Archiving cancels its remaining reminders.")).toBeVisible()
    for (const preset of ["Anniversaries", "Monthiversaries", "Every 100 days", "Weekly streak", "Recovery ladder"]) {
      expect(screen.getByRole("button", { name: preset })).toBeVisible()
    }

    expect(storeState.addTimer).not.toHaveBeenCalled()
    expect(storeState.archiveTimer).not.toHaveBeenCalled()
  })

  it("creates first, then archives the original, and undo restores both sides", async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<StartCountUpFromDate timer={pastTimer()} onComplete={onComplete} />)

    await user.click(screen.getByRole("button", { name: "Start counting up from this date" }))
    await user.click(screen.getByRole("button", { name: "Start a new count-up timer" }))

    const created = vi.mocked(storeState.addTimer!).mock.calls[0]?.[0]
    expect(created).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^timer_/),
        label: "Together",
        targetDate: "2026-06-02T08:00:00.000Z",
        timezone: "Europe/Warsaw",
        color: "#336699",
        spaceId: "space-a",
        mode: "since",
        milestones: { rules: [{ unit: "years", every: 1 }] },
        reminders: [{ offsetMinutes: 0 }],
        notify: false,
      }),
    )
    expect(storeState.archiveTimer).toHaveBeenCalledWith("timer-a")
    expect(vi.mocked(storeState.addTimer!).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(storeState.archiveTimer!).mock.invocationCallOrder[0]!,
    )
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(
      "Counting up since Jun 2, 2026 · 10:00",
      expect.objectContaining({ action: expect.objectContaining({ label: "Undo", onClick: expect.any(Function) }) }),
    )

    const [, options] = toastMock.mock.calls[0] as unknown as [string, { action: { onClick: () => void } }]
    options.action.onClick()

    expect(storeState.removeTimer).toHaveBeenCalledWith(created!.id)
    expect(storeState.unarchiveTimer).toHaveBeenCalledWith("timer-a")
  })

  it("can keep both timers and compile another shared preset", async () => {
    const user = userEvent.setup()
    render(<StartCountUpFromDate timer={pastTimer()} />)

    await user.click(screen.getByRole("button", { name: "Start counting up from this date" }))
    await user.click(screen.getByRole("button", { name: "Recovery ladder" }))
    await user.click(screen.getByRole("radio", { name: "Keep both" }))
    await user.click(screen.getByRole("button", { name: "Start a new count-up timer" }))

    expect(storeState.addTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        milestones: {
          rules: [
            { unit: "days", at: [1, 3] },
            { unit: "weeks", at: [1] },
            { unit: "months", at: [1, 3] },
            { unit: "years", at: [1] },
          ],
        },
      }),
    )
    expect(storeState.archiveTimer).not.toHaveBeenCalled()

    const [, options] = toastMock.mock.calls[0] as unknown as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(storeState.removeTimer).toHaveBeenCalled()
    expect(storeState.unarchiveTimer).not.toHaveBeenCalled()
  })

  it("leaves the original untouched when creation fails", async () => {
    const user = userEvent.setup()
    vi.mocked(storeState.addTimer!).mockReturnValue(false)
    render(<StartCountUpFromDate timer={pastTimer()} />)

    await user.click(screen.getByRole("button", { name: "Start counting up from this date" }))
    await user.click(screen.getByRole("button", { name: "Start a new count-up timer" }))

    expect(storeState.archiveTimer).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(
      "You already have the maximum number of active timers. Remove one to add more.",
    )
    expect(screen.getByRole("dialog", { name: "Start a new count-up timer" })).toBeVisible()
  })
})
