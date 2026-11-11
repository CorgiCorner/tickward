import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { DASHBOARD_VIEW_STORAGE_KEY, useDashboardView } from "@/components/dashboard/dashboard-view"
import { DashboardDialToggle, DashboardViewSwitch } from "@/components/dashboard/dashboard-view-switch"
import { TooltipProvider } from "@/components/ui/tooltip"

function Controls() {
  const [view, setView] = useDashboardView()
  return (
    <TooltipProvider>
      <DashboardViewSwitch value={view} onChange={setView} />
      <DashboardDialToggle value={view} onChange={setView} />
    </TooltipProvider>
  )
}

describe("dashboard view controls", () => {
  afterEach(() => localStorage.clear())

  it("brings back the list when the phone dial toggle is turned off", async () => {
    const user = userEvent.setup()
    render(<Controls />)

    await user.click(screen.getByRole("radio", { name: "List view" }))
    await user.click(screen.getByRole("button", { name: "Dial view" }))
    expect(localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY)).toBe("dial")

    await user.click(screen.getByRole("button", { name: "Dial view" }))
    expect(localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY)).toBe("list")
    expect(screen.getByRole("radio", { name: "List view" })).toHaveAttribute("aria-checked", "true")
  })

  it("is one tab stop and moves between views with the arrow keys", async () => {
    const user = userEvent.setup()
    render(<Controls />)

    const grid = screen.getByRole("radio", { name: "Grid view" })
    const list = screen.getByRole("radio", { name: "List view" })
    const dial = screen.getByRole("radio", { name: "Dial view" })
    expect([grid, list, dial].map((radio) => radio.tabIndex)).toEqual([0, -1, -1])

    await user.tab()
    expect(grid).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(list).toHaveFocus()
    expect(list).toHaveAttribute("aria-checked", "true")
    expect(localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY)).toBe("list")
    expect([grid, list, dial].map((radio) => radio.tabIndex)).toEqual([-1, 0, -1])

    await user.keyboard("{ArrowLeft}{ArrowLeft}")
    expect(dial).toHaveFocus()
    expect(dial).toHaveAttribute("aria-checked", "true")
    await user.keyboard("{Home}")
    expect(grid).toHaveFocus()
    expect(grid).toHaveAttribute("aria-checked", "true")
    await user.keyboard("{End}")
    expect(dial).toHaveAttribute("aria-checked", "true")

    // Tab leaves the group instead of walking through every option.
    await user.tab()
    expect(screen.getByRole("button", { name: "Dial view" })).toHaveFocus()
  })
})
