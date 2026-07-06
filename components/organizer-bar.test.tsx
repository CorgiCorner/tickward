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
      sortMode: "soonest",
      timerFilters: { type: "all", pinned: false, muted: false, shared: false, recurring: false },
      setActiveSpace: vi.fn(),
      setTimerSortMode: vi.fn(),
      setTimerFilterType: vi.fn(),
      setTimerFilter: vi.fn(),
      clearTimerFilters: vi.fn(),
      createSpace: vi.fn(),
      updateSpace: vi.fn(),
      deleteSpace: vi.fn(),
    }
  })

  it("opens timer filters and toggles show-only options", async () => {
    const user = userEvent.setup()
    renderOrganizerBar()

    const filterButton = screen.getByRole("button", { name: "Filters" })
    expect(filterButton).not.toHaveTextContent("Filters")
    expect(screen.queryByText("Filter timers")).not.toBeInTheDocument()

    await user.click(filterButton)
    await user.click(screen.getByRole("button", { name: /Muted/ }))

    expect(storeState.setTimerFilter).toHaveBeenCalledWith("muted", true)
  })

  it("sets timer filter type and clears filters", async () => {
    const user = userEvent.setup()
    renderOrganizerBar()

    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.click(screen.getByRole("button", { name: "Count-up" }))
    await user.click(screen.getByRole("button", { name: "Clear filters" }))

    expect(storeState.setTimerFilterType).toHaveBeenCalledWith("countUp")
    expect(storeState.clearTimerFilters).toHaveBeenCalled()
  })

  it("opens sort options and sets the selected sort mode", async () => {
    const user = userEvent.setup()
    renderOrganizerBar()

    const sortButton = screen.getByRole("button", { name: "Sort timers" })
    const sortOptions = [
      ["Manual order", "manual"],
      ["Soonest first", "soonest"],
      ["Latest first", "latest"],
      ["Name A-Z", "name_asc"],
      ["Recently added", "recently_added"],
    ] as const

    await user.click(sortButton)

    expect(screen.getByText("Sort by")).toBeInTheDocument()
    for (const [optionLabel] of sortOptions) {
      expect(screen.getByRole("button", { name: optionLabel })).toBeInTheDocument()
    }
    expect(screen.getByRole("button", { name: "Soonest first" })).toHaveAttribute("aria-pressed", "true")

    await user.click(screen.getByRole("button", { name: "Manual order" }))

    expect(storeState.setTimerSortMode).toHaveBeenLastCalledWith("manual")
  })

  it("adds a space inline from the bar without a management modal", async () => {
    const user = userEvent.setup()
    renderOrganizerBar()

    expect(screen.getByRole("button", { name: "Filters" })).not.toHaveTextContent("Filters")
    expect(screen.getByRole("button", { name: "Sort timers" })).not.toHaveTextContent(/Manual|Soonest/)

    await user.click(screen.getByRole("button", { name: "New space" }))

    const input = await screen.findByPlaceholderText("Work")
    await user.type(input, "Personal{Enter}")

    expect(storeState.createSpace).toHaveBeenCalledWith("Personal", undefined)
  })

  it("disables the add-space affordance at the space limit", async () => {
    const user = userEvent.setup()
    storeState.spaces = [makeSpace({ id: "space-a" }), makeSpace({ id: "space-b", name: "Personal" })]

    renderOrganizerBar()

    const addSpaceButton = screen.getByRole("button", { name: "New space" })
    expect(addSpaceButton).toBeDisabled()

    await user.click(addSpaceButton)

    expect(screen.queryByPlaceholderText("Work")).not.toBeInTheDocument()
    expect(storeState.createSpace).not.toHaveBeenCalled()
  })

  it("shows the active filter count", () => {
    storeState.timerFilters = { type: "countUp", pinned: false, muted: false, shared: false, recurring: false }

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
