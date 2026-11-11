import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { storeCountUpFormat } from "@/components/dashboard/count-up-format"

import { DialClockProvider, type DialClock } from "./dial-clock"
import { DialDashboard } from "./dial-dashboard"
import { dialDemoNowMs, dialDemoTimerList, dialDemoTimers } from "./dial.fixtures"

function manualClock(startMs: number) {
  let now = startMs
  const listeners = new Set<() => void>()
  const clock: DialClock = {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    now: () => now,
  }
  return {
    clock,
    advance(ms: number) {
      now += ms
      act(() => {
        for (const listener of listeners) listener()
      })
    },
  }
}

function renderDashboard(props: Partial<Parameters<typeof DialDashboard>[0]> = {}, startMs = dialDemoNowMs) {
  const manual = manualClock(startMs)
  const view = render(
    <DialClockProvider clock={manual.clock}>
      <DialDashboard timers={dialDemoTimerList} {...props} />
    </DialClockProvider>,
  )
  return { ...view, advance: manual.advance }
}

function hero() {
  return screen.getByTestId("dial-hero")
}

describe("DialDashboard", () => {
  it("lists timers in the iPhone sections and selects the first pinned timer", () => {
    renderDashboard()
    const list = screen.getByRole("group", { name: "Timers" })
    expect(
      within(list)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(["Pinned", "This week", "Later", "Counting up"])
    expect(hero().getAttribute("data-timer-id")).toBe("train")
    expect(within(hero()).getByRole("heading", { level: 2 })).toHaveTextContent("Train to Gdansk")
    expect(hero()).toHaveTextContent("Wed, Nov 11 · 16:00 · Europe/Warsaw")
    expect(hero()).toHaveTextContent("Reminder today at 16:00, 1 day before")
    expect(screen.getByRole("button", { name: /^Show Train to Gdansk/ })).toHaveAttribute("aria-pressed", "true")
  })

  it("falls back to the nearest countdown when nothing is pinned", () => {
    renderDashboard({ timers: dialDemoTimerList.map((timer) => ({ ...timer, pinned: false })) })
    expect(hero().getAttribute("data-timer-id")).toBe("herbs")
  })

  it("shows a selected row on the dial and reports the selection", async () => {
    const onSelectedIdChange = vi.fn()
    renderDashboard({ onSelectedIdChange })
    await userEvent.click(screen.getByRole("button", { name: /^Show Parcel picked up/ }))
    expect(onSelectedIdChange).toHaveBeenCalledWith("parcel")
    expect(hero().getAttribute("data-timer-id")).toBe("parcel")
    expect(within(hero()).getByRole("list", { name: "Milestones" })).toHaveTextContent("1 day")
    expect(hero()).toHaveTextContent("9 hours to 1 day")
    expect(screen.getByTestId("tick-dial").querySelector("g[data-motion]")?.getAttribute("data-motion")).toBe("select")
  })

  it("follows a controlled selection", () => {
    const { rerender } = render(<DialDashboard timers={dialDemoTimerList} selectedId="lease" />)
    expect(hero().getAttribute("data-timer-id")).toBe("lease")
    rerender(<DialDashboard timers={dialDemoTimerList} selectedId="marta" />)
    expect(hero().getAttribute("data-timer-id")).toBe("marta")
  })

  it("ticks every second in the dial and the rows without rebuilding the list", () => {
    const { advance } = renderDashboard()
    const list = screen.getByRole("group", { name: "Timers" })
    const row = screen.getByRole("button", { name: /^Show Lease renewal call/ })
    expect(row).toHaveTextContent("00:00:00")
    expect(within(hero()).getByTestId("dial-readout")).toHaveTextContent("1day03:00:00")
    advance(1_000)
    expect(row).toHaveTextContent("23:59:59")
    expect(within(hero()).getByTestId("dial-readout")).toHaveTextContent("1day02:59:59")
    expect(screen.getByRole("group", { name: "Timers" })).toBe(list)
    expect(screen.getByRole("button", { name: /^Show Lease renewal call/ })).toBe(row)
  })

  it("marks the milestone day on a count-up", async () => {
    renderDashboard({ defaultSelectedId: "met", momentLedger: { has: () => true, claim: () => false } })
    expect(hero()).toHaveTextContent("1,300days")
    const trail = within(hero()).getByRole("list", { name: "Milestones" })
    expect(
      within(trail)
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-state")),
    ).toEqual(["reached", "reached", "next", "later"])
    expect(screen.getByRole("button", { name: /^Show Since we met/ })).toHaveTextContent("Milestone today")
  })

  it("reads a count-up in the count format chosen for it on this device", () => {
    renderDashboard({ defaultSelectedId: "met", momentLedger: { has: () => true, claim: () => false } })
    expect(screen.getByTestId("dial-readout")).toHaveTextContent("1,300days")

    // The card and the detail view write the same per-timer choice.
    act(() => storeCountUpFormat("met", "calendar"))
    expect(screen.getByTestId("dial-readout")).toHaveTextContent(/^3years/)

    act(() => storeCountUpFormat("met", "days"))
    expect(screen.getByTestId("dial-readout")).toHaveTextContent("1,300days")
  })

  it("pins from the dial when the host handles it", async () => {
    const onTogglePin = vi.fn()
    renderDashboard({ onTogglePin })
    await userEvent.click(screen.getByRole("button", { name: "Unpin timer" }))
    expect(onTogglePin).toHaveBeenCalledWith(dialDemoTimers.train)
  })

  it("says how to start when there are no timers", () => {
    renderDashboard({ timers: [] })
    expect(screen.getByText("Add a timer to see it on the dial.")).toBeInTheDocument()
  })

  it("opens focus mode on the dial and returns focus to the opener on Escape", async () => {
    const user = userEvent.setup()
    renderDashboard()
    const opener = screen.getByRole("button", { name: "Focus timer" })
    await user.click(opener)
    const dialog = await screen.findByRole("dialog", { name: "Train to Gdansk in focus mode" })
    expect(dialog).toHaveTextContent("Train to Gdansk")
    expect(within(dialog).getByTestId("dial-readout")).toHaveTextContent("1day03:00:00")
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Exit focus mode" })).toHaveFocus())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("dial-focus-mode")).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it("has focus back on the opener in the same update that removes focus mode", async () => {
    const user = userEvent.setup()
    renderDashboard()
    const opener = screen.getByRole("button", { name: "Focus timer" })
    await user.click(opener)
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit focus mode" })).toHaveFocus())

    // Read focus at the first DOM change without the dialog. A later return leaves the body
    // focused here, and a slow runner can resume the test inside that gap.
    const focusedAtRemoval: Array<Element | null> = []
    const observer = new MutationObserver(() => {
      if (focusedAtRemoval.length === 0 && !screen.queryByTestId("dial-focus-mode")) {
        focusedAtRemoval.push(document.activeElement)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("dial-focus-mode")).not.toBeInTheDocument())
    observer.disconnect()
    expect(focusedAtRemoval).toEqual([opener])
  })

  it("closes focus mode with its close button and keeps Tab inside", async () => {
    const user = userEvent.setup()
    renderDashboard({ defaultFocusOpen: true })
    const close = await screen.findByRole("button", { name: "Exit focus mode" })
    await waitFor(() => expect(close).toHaveFocus())
    await user.tab()
    expect(close).toHaveFocus()
    await user.click(close)
    await waitFor(() => expect(screen.queryByTestId("dial-focus-mode")).not.toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Focus timer" })).toHaveFocus()
  })
})
