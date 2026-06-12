import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Header } from "@/components/header"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TimerStore } from "@/lib/store"

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
  AccountButton: () => <span>Sign in</span>,
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

function renderHeader() {
  return render(
    <TooltipProvider delayDuration={0}>
      <Header />
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

  it("does not render the removed add-timer action", () => {
    renderHeader()

    expect(screen.queryByRole("button", { name: "Add new" })).not.toBeInTheDocument()
    expect(mocks.timerForm).not.toHaveBeenCalled()
  })

  it("does not render project settings in the header toolbar", () => {
    renderHeader()

    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument()
  })

  it("keeps account and theme controls in the header toolbar", () => {
    renderHeader()

    const header = screen.getByRole("banner")
    expect(within(header).getByText("GitHub stars")).toBeVisible()
    expect(within(header).getByText("Sign in")).toBeVisible()
    expect(within(header).getByRole("button", { name: "Toggle theme" })).toBeVisible()
  })
})
