import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OrganizerBar } from "@/components/organizer-bar"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TimerStore } from "@/lib/store"
import { makeSpace, makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

function renderOrganizerBar() {
  return render(
    <TooltipProvider delayDuration={0}>
      <OrganizerBar />
    </TooltipProvider>,
  )
}

describe("OrganizerBar", () => {
  beforeEach(() => {
    storeState = {
      timers: [
        makeTimer({ id: "timer-notify", notify: true, spaceId: "space-a" }),
        makeTimer({ id: "timer-shared", sharedAt: "2026-06-06T12:00:00.000Z" }),
      ],
      spaces: [makeSpace({ id: "space-a" })],
      activeSpaceId: null,
      sortMode: "manual",
      timerFilters: { notifications: false, shared: false },
      setActiveSpace: vi.fn(),
      setTimerSortMode: vi.fn(),
      setTimerFilter: vi.fn(),
      createSpace: vi.fn(),
      updateSpace: vi.fn(),
      deleteSpace: vi.fn(),
    }
  })

  it("opens timer filters and toggles notifications", async () => {
    const user = userEvent.setup()
    renderOrganizerBar()

    const filterButton = screen.getByRole("button", { name: "Filters" })
    expect(filterButton).not.toHaveTextContent("Filters")
    expect(screen.queryByText("Filter timers")).not.toBeInTheDocument()

    await user.click(filterButton)
    await user.click(screen.getByRole("button", { name: /Notifications enabled/ }))

    expect(storeState.setTimerFilter).toHaveBeenCalledWith("notifications", true)
  })

  it("keeps organizer actions icon-only", async () => {
    const user = userEvent.setup()
    renderOrganizerBar()

    expect(screen.getByRole("button", { name: "Filters" })).not.toHaveTextContent("Filters")
    expect(screen.getByRole("button", { name: "Sort timers" })).not.toHaveTextContent(/Manual|Soonest/)

    await user.click(screen.getByRole("button", { name: "Manage spaces" }))

    expect(screen.getByRole("dialog", { name: "Spaces" })).toBeVisible()
  })

  it("shows the active filter count", () => {
    storeState.timerFilters = { notifications: true, shared: false }

    renderOrganizerBar()

    expect(screen.getByRole("button", { name: "Filters" })).toHaveTextContent("1")
  })

  it("counts timers from missing spaces as unassigned", () => {
    storeState.timers = [
      makeTimer({ id: "timer-visible", spaceId: "space-a" }),
      makeTimer({ id: "timer-orphan", spaceId: "space-missing" }),
      makeTimer({ id: "timer-unassigned", spaceId: undefined }),
    ]

    renderOrganizerBar()

    expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("3")
    expect(screen.getByRole("button", { name: /^Work/ })).toHaveTextContent("1")
    expect(screen.getByRole("button", { name: /^Unassigned/ })).toHaveTextContent("2")
  })
})
