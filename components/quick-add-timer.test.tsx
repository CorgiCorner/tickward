import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { QuickAddTimer } from "@/components/quick-add-timer"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getEntitlements, timerSpaceLimitMessage } from "@/lib/entitlements"
import type { TimerStore } from "@/lib/store"
import { MAX_TIMERS, timerLimitMessage } from "@/lib/timer-limits"
import type { Timer } from "@/lib/types"
import { toast } from "sonner"

let storeState: Partial<TimerStore>

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

vi.mock("@/lib/default-timezone.client", () => ({
  useDefaultTimeZone: () => "UTC",
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function renderQuickAddTimer(props: ComponentProps<typeof QuickAddTimer> = {}) {
  return render(
    <TooltipProvider delayDuration={0}>
      <QuickAddTimer {...props} />
    </TooltipProvider>,
  )
}

function timerFixture(index: number): Timer {
  return {
    id: `timer-${index}`,
    label: `Timer ${index}`,
    targetDate: "2030-01-01T00:00:00.000Z",
    timezone: "UTC",
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("QuickAddTimer", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    storeState = {
      activeSpaceId: "space-a",
      timers: [],
      addTimer: vi.fn(() => true),
    }
  })

  it("submits a trimmed timer through the form schema", async () => {
    const user = userEvent.setup()
    renderQuickAddTimer()

    const addButton = screen.getByRole("button", { name: "Add" })
    expect(addButton).toBeDisabled()

    await user.type(screen.getByPlaceholderText("Timer name"), " Launch ")

    await waitFor(() => expect(addButton).toBeEnabled())
    await user.click(addButton)

    expect(storeState.addTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Launch",
        spaceId: "space-a",
        targetDate: expect.any(String),
        timezone: "UTC",
      }),
    )
  })

  it("supports a controlled timer name draft", async () => {
    const onLabelChange = vi.fn()

    renderQuickAddTimer({ label: "Trip to Tokyo", onLabelChange })

    const input = screen.getByPlaceholderText("Timer name")
    expect(input).toHaveValue("Trip to Tokyo")

    await userEvent.setup().type(input, "!")

    expect(onLabelChange).toHaveBeenLastCalledWith("Trip to Tokyo!")
  })

  it("keeps quick add visible but disables submit at the timer limit", async () => {
    const user = userEvent.setup()
    storeState.timers = Array.from({ length: MAX_TIMERS }, (_, index) => timerFixture(index))

    renderQuickAddTimer()

    expect(screen.getByPlaceholderText("Timer name")).toBeVisible()
    const addButton = screen.getByRole("button", { name: "Add" })
    expect(addButton).toBeDisabled()

    await user.hover(addButton.parentElement ?? addButton)

    const [message] = await screen.findAllByText(timerLimitMessage())
    expect(message).toBeVisible()
  })

  it("disables submit at the active space timer limit", async () => {
    const user = userEvent.setup()
    vi.stubEnv("NEXT_PUBLIC_TICKWARD_MAX_TIMERS_PER_SPACE", "1")
    storeState.timers = [timerFixture(0)]
    storeState.timers[0].spaceId = "space-a"

    renderQuickAddTimer()

    const addButton = screen.getByRole("button", { name: "Add" })
    expect(addButton).toBeDisabled()

    await user.hover(addButton.parentElement ?? addButton)

    const [message] = await screen.findAllByText(timerSpaceLimitMessage(getEntitlements()))
    expect(message).toBeVisible()
  })

  it("shows a limit error if the store rejects a quick add submit", async () => {
    const user = userEvent.setup()
    storeState.addTimer = vi.fn(() => false)

    renderQuickAddTimer()

    const addButton = screen.getByRole("button", { name: "Add" })
    await user.type(screen.getByPlaceholderText("Timer name"), "Launch")
    await waitFor(() => expect(addButton).toBeEnabled())
    await user.click(addButton)

    expect(toast.error).toHaveBeenCalledWith(timerLimitMessage())
    expect(toast.success).not.toHaveBeenCalled()
  })
})
