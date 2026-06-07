import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Header } from "@/components/header"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TimerStore } from "@/lib/store"
import { MAX_TIMERS, timerLimitMessage } from "@/lib/timer-limits"

let storeState: Partial<TimerStore>
const mocks = vi.hoisted(() => ({
  timerForm: vi.fn(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}))

vi.mock("@/components/project-switcher", () => ({
  ProjectSwitcher: () => <div data-testid="project-switcher" />,
}))

vi.mock("@/components/account-auth", () => ({
  AccountButton: () => <a href="/settings">Sign in</a>,
}))

vi.mock("@/components/github-repo-button", () => ({
  GitHubRepoButton: () => <a href="https://github.com/CorgiCorner/tickward">GitHub stars</a>,
}))

vi.mock("@/components/settings-sheet", () => ({
  SettingsSheet: () => <button type="button">Settings</button>,
}))

vi.mock("@/components/timer-form", () => ({
  TimerForm: (props: { open: boolean }) => {
    mocks.timerForm(props)
    return props.open ? <div role="dialog">Timer form</div> : null
  },
}))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

function renderHeader(timerCount = 0) {
  return render(
    <TooltipProvider delayDuration={0}>
      <Header timerCount={timerCount} timerMax={MAX_TIMERS} />
    </TooltipProvider>,
  )
}

describe("Header", () => {
  beforeEach(() => {
    mocks.timerForm.mockClear()
    storeState = {
      addTimer: vi.fn(() => true),
      projects: [
        {
          id: "project-a",
          name: "Main",
          restoreKey: "restoreKey_123",
          createdAt: "2026-05-20T00:00:00.000Z",
          updatedAt: "2026-05-20T00:00:00.000Z",
        },
      ],
      activeProjectId: "project-a",
    }
  })

  it("opens the timer form directly from the add button", async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole("button", { name: "Add new" }))

    expect(screen.getByText("Timer form")).toBeVisible()
    expect(mocks.timerForm).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }))
  })

  it("keeps the primary add action at the far right of the header toolbar", () => {
    renderHeader()

    const header = screen.getByRole("banner")
    const addButton = within(header).getByRole("button", { name: "Add new" })
    const toolbar = addButton.parentElement

    expect(toolbar?.lastElementChild).toBe(addButton)
    expect(addButton).toHaveAttribute("data-variant", "outline")
  })

  it("disables the add button with a limit tooltip at the timer limit", async () => {
    const user = userEvent.setup()
    renderHeader(MAX_TIMERS)

    const addButton = screen.getByRole("button", { name: "Add new" })
    expect(addButton).toBeDisabled()
    expect(screen.queryByText("New Timer")).not.toBeInTheDocument()

    await user.hover(addButton.parentElement ?? addButton)

    const [message] = await screen.findAllByText(timerLimitMessage())
    expect(message).toBeVisible()
  })

  it("does not render project settings in the header toolbar", () => {
    renderHeader()

    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument()
  })
})
