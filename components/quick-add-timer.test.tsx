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
  useBrowserTimeZone: () => "Europe/Warsaw",
  useDefaultTimeZone: () => "UTC",
}))

vi.mock("@/components/timezone-select", () => ({
  TimezoneSelect: (props: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Timezone" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
  ),
}))

vi.mock("@/components/use-now", () => ({
  useNow: () => new Date("2026-06-05T08:00:00.000Z").getTime(),
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

function getFormAddButtons() {
  return screen.getAllByRole("button", { name: "Add" }).filter((button) => button.closest("form"))
}

function getPlusAddButton() {
  const [button] = getFormAddButtons()
  if (!button) throw new Error("Expected the quick-add plus submit button to render.")
  return button
}

function getEnterHintAddButton() {
  const [, button] = getFormAddButtons()
  if (!button) throw new Error("Expected the quick-add enter hint submit button to render.")
  return button
}

function getPopoverAddButton() {
  const button = screen.getAllByRole("button", { name: "Add" }).find((candidate) => !candidate.closest("form"))
  if (!button) throw new Error("Expected the popover Add button to render.")
  return button
}

function queryPopoverAddButtons() {
  return screen.queryAllByRole("button", { name: "Add" }).filter((button) => !button.closest("form"))
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
    vi.clearAllMocks()
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

    const addButton = getPlusAddButton()
    expect(addButton).toBeEnabled()

    await user.type(screen.getByPlaceholderText("Timer 1"), " Launch ")

    await waitFor(() => expect(addButton).toBeEnabled())
    await user.click(addButton)

    expect(storeState.addTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Launch",
        notify: true,
        spaceId: "space-a",
        targetDate: expect.any(String),
        timezone: "UTC",
      }),
    )
  })

  it("submits through the enter hint button", async () => {
    const user = userEvent.setup()
    renderQuickAddTimer()

    const addButton = getEnterHintAddButton()
    expect(addButton).toBeEnabled()

    await user.type(screen.getByPlaceholderText("Timer 1"), " Launch ")

    await waitFor(() => expect(addButton).toBeEnabled())
    await user.click(addButton)

    expect(storeState.addTimer).toHaveBeenCalledTimes(1)
    expect(storeState.addTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Launch",
        notify: true,
        spaceId: "space-a",
        targetDate: expect.any(String),
        timezone: "UTC",
      }),
    )
  })

  it("submits a generated timer name when the draft is empty", async () => {
    const user = userEvent.setup()
    renderQuickAddTimer()

    const addButton = getPlusAddButton()
    await waitFor(() => expect(addButton).toBeEnabled())
    await user.click(addButton)

    expect(storeState.addTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Timer 1",
        notify: true,
        spaceId: "space-a",
      }),
    )
  })

  it("supports a controlled timer name draft", async () => {
    const onLabelChange = vi.fn()

    renderQuickAddTimer({ label: "Trip to Tokyo", onLabelChange })

    const input = screen.getByPlaceholderText("Timer 1")
    expect(input).toHaveValue("Trip to Tokyo")

    await userEvent.setup().type(input, "!")

    expect(onLabelChange).toHaveBeenLastCalledWith("Trip to Tokyo!")
  })

  it("keeps quick add visible but disables submit at the timer limit", async () => {
    const user = userEvent.setup()
    storeState.timers = Array.from({ length: MAX_TIMERS }, (_, index) => timerFixture(index))

    renderQuickAddTimer()

    expect(screen.getByRole("textbox")).toBeVisible()
    const addButton = getPlusAddButton()
    expect(addButton).toBeDisabled()
    expect(getEnterHintAddButton()).toBeDisabled()

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

    const addButton = getPlusAddButton()
    expect(addButton).toBeDisabled()
    expect(getEnterHintAddButton()).toBeDisabled()

    await user.hover(addButton.parentElement ?? addButton)

    const [message] = await screen.findAllByText(timerSpaceLimitMessage(getEntitlements()))
    expect(message).toBeVisible()
  })

  it("disables the enter hint button when the form is invalid or at the timer limit", () => {
    const { unmount } = renderQuickAddTimer({ label: "x".repeat(61), onLabelChange: vi.fn() })

    expect(getEnterHintAddButton()).toBeDisabled()

    unmount()
    storeState.timers = Array.from({ length: MAX_TIMERS }, (_, index) => timerFixture(index))

    renderQuickAddTimer()

    expect(getEnterHintAddButton()).toBeDisabled()
  })

  it("shows a limit error if the store rejects a quick add submit", async () => {
    const user = userEvent.setup()
    storeState.addTimer = vi.fn(() => false)

    renderQuickAddTimer()

    const addButton = getPlusAddButton()
    await user.type(screen.getByPlaceholderText("Timer 1"), "Launch")
    await waitFor(() => expect(addButton).toBeEnabled())
    await user.click(addButton)

    expect(toast.error).toHaveBeenCalledWith(timerLimitMessage())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("keeps the timer name input at 16px on mobile to avoid iOS focus zoom", () => {
    renderQuickAddTimer()

    const input = screen.getByPlaceholderText("Timer 1")
    expect(input.className).toContain("text-base")
    expect(input.className).toContain("md:text-sm")
    expect(input.className).not.toMatch(/(?:^|\s)text-sm(?:\s|$)/)
  })

  it("renders native mobile date and time inputs alongside desktop schedule controls", async () => {
    const user = userEvent.setup()
    const { container } = renderQuickAddTimer()

    const enterHintGlyph = container.querySelector("kbd")
    expect(enterHintGlyph).toBeVisible()
    expect(getEnterHintAddButton()).toContainElement(enterHintGlyph)

    await user.click(screen.getByRole("button", { name: "Schedule" }))

    expect(screen.getByLabelText("Date")).toHaveAttribute("type", "date")
    expect(screen.getByLabelText("Time")).toHaveAttribute("type", "time")
    expect(screen.getByLabelText("Hours")).toBeVisible()
    expect(screen.getByLabelText("Minutes")).toBeVisible()
    expect(document.body.querySelector('input[type="date"]')).toBeInTheDocument()
    expect(document.body.querySelector('input[type="time"]')).toBeInTheDocument()
    expect(document.body.querySelector("select")).not.toBeInTheDocument()

    expect(screen.getByLabelText("Timezone")).toBeVisible()
    expect(screen.getByLabelText("Timezone")).toHaveValue("UTC")
  })

  it("submits from the popover Add button and closes the popover on success", async () => {
    const user = userEvent.setup()
    renderQuickAddTimer()

    const form = screen.getByPlaceholderText("Timer 1").closest("form")
    const formId = form?.getAttribute("id")
    expect(formId).toBeTruthy()

    await user.type(screen.getByPlaceholderText("Timer 1"), "Launch")
    await user.click(screen.getByRole("button", { name: "Schedule" }))

    const addButton = getPopoverAddButton()
    expect(addButton).toHaveAttribute("form", formId)
    await waitFor(() => expect(addButton).toBeEnabled())
    await user.click(addButton)

    expect(storeState.addTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Launch",
        notify: true,
        spaceId: "space-a",
        targetDate: expect.any(String),
        timezone: "UTC",
      }),
    )
    await waitFor(() => expect(queryPopoverAddButtons()).toHaveLength(0))
  })

  it("creates a duration-mode timer from quick add", async () => {
    const user = userEvent.setup()
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-05T08:00:00.000Z").getTime())

    try {
      renderQuickAddTimer()

      await user.click(screen.getByRole("button", { name: "Schedule" }))
      await user.click(screen.getByRole("button", { name: "Duration" }))
      await user.click(screen.getByRole("button", { name: "7 d" }))

      expect(screen.getByLabelText("Days")).toHaveValue("07")
      expect(screen.getByLabelText("Hours")).toHaveValue("00")
      expect(screen.getByLabelText("Minutes")).toHaveValue("00")
      expect(screen.getByLabelText("Seconds")).toHaveValue("00")
      expect(screen.getByText("in 7 d")).toBeVisible()
      await user.click(getPopoverAddButton())

      expect(storeState.addTimer).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "Timer 1",
          targetDate: "2026-06-12T08:00:00.000Z",
          timezone: "Europe/Warsaw",
        }),
      )
    } finally {
      nowSpy.mockRestore()
    }
  })
})
