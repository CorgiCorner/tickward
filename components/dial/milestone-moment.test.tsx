import { act, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DialClockProvider, fixedDialClock } from "./dial-clock"
import { DialDashboard } from "./dial-dashboard"
import { dialDemoNowMs, dialDemoTimerList } from "./dial.fixtures"
import {
  createLocalMomentLedger,
  createMemoryMomentLedger,
  MOMENT_TIMELINE,
  type DialMomentLedger,
} from "./milestone-moment"

function renderMet(ledger: DialMomentLedger, extra: { allowMomentReplay?: boolean } = {}) {
  return render(
    <StrictMode>
      <DialClockProvider clock={fixedDialClock(dialDemoNowMs)}>
        <DialDashboard timers={dialDemoTimerList} defaultSelectedId="met" momentLedger={ledger} {...extra} />
      </DialClockProvider>
    </StrictMode>,
  )
}

function face() {
  return screen.getByTestId("tick-dial").parentElement!
}

function badge() {
  return screen.getByTestId("dial-milestone-badge")
}

function numberLayers() {
  return Array.from(screen.getByTestId("dial-readout").querySelectorAll("[data-role]")).map((layer) => [
    layer.getAttribute("data-role"),
    layer.textContent,
    layer.getAttribute("data-shown"),
  ])
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe("milestone moment", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockReducedMotion(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("sweeps, blooms, rolls the count and brings the badge in last", () => {
    renderMet(createMemoryMomentLedger())
    expect(badge().getAttribute("data-shown")).toBe("false")
    expect(numberLayers()).toEqual([
      ["now", "1,300", "false"],
      ["was", "1,299", "true"],
    ])

    advance(MOMENT_TIMELINE.start)
    expect(face().getAttribute("data-moment")).toBe("sweep")
    expect(screen.getByTestId("tick-dial").querySelector("g[data-motion]")?.getAttribute("data-motion")).toBe("moment")

    advance(MOMENT_TIMELINE.bloom - MOMENT_TIMELINE.start)
    expect(face().getAttribute("data-moment")).toBe("bloom")
    expect(numberLayers()[0]).toEqual(["now", "1,300", "true"])
    expect(badge().getAttribute("data-shown")).toBe("false")

    advance(MOMENT_TIMELINE.badge - MOMENT_TIMELINE.bloom)
    expect(face().getAttribute("data-moment")).toBe("after")
    expect(badge().getAttribute("data-shown")).toBe("true")

    advance(MOMENT_TIMELINE.end - MOMENT_TIMELINE.badge)
    expect(face().hasAttribute("data-moment")).toBe(false)
    expect(numberLayers()).toEqual([["now", "1,300", "true"]])
  })

  it("plays once per timer and milestone value", () => {
    const ledger = createMemoryMomentLedger()
    const { unmount } = renderMet(ledger)
    advance(MOMENT_TIMELINE.end)
    fireEvent.click(screen.getByRole("button", { name: /^Show Parcel picked up/ }))
    fireEvent.click(screen.getByRole("button", { name: /^Show Since we met/ }))
    advance(MOMENT_TIMELINE.start)
    expect(face().hasAttribute("data-moment")).toBe(false)
    expect(badge().getAttribute("data-shown")).toBe("true")
    unmount()

    renderMet(ledger)
    advance(MOMENT_TIMELINE.start)
    expect(face().hasAttribute("data-moment")).toBe(false)
    expect(badge().getAttribute("data-shown")).toBe("true")
  })

  it("remembers played moments on this device", () => {
    const first = renderMet(createLocalMomentLedger())
    advance(MOMENT_TIMELINE.end)
    first.unmount()
    expect(localStorage.getItem("tickward:milestone-moments")).toContain("dial|met|days|1300")

    renderMet(createLocalMomentLedger())
    advance(MOMENT_TIMELINE.start)
    expect(face().hasAttribute("data-moment")).toBe(false)
    expect(numberLayers()).toEqual([["now", "1,300", "true"]])
  })

  it("replays from the badge only when allowed", () => {
    const ledger = createMemoryMomentLedger()
    const { unmount } = renderMet(ledger)
    advance(MOMENT_TIMELINE.end)
    expect(screen.queryByRole("button", { name: "Replay the milestone moment" })).not.toBeInTheDocument()
    unmount()

    renderMet(ledger, { allowMomentReplay: true })
    fireEvent.click(screen.getByRole("button", { name: "Replay the milestone moment" }))
    advance(MOMENT_TIMELINE.start)
    expect(face().getAttribute("data-moment")).toBe("sweep")
  })

  it("keeps only the fades with reduced motion", () => {
    mockReducedMotion(true)
    renderMet(createMemoryMomentLedger())
    const layer = screen.getByTestId("tick-dial").querySelector("g[data-motion]")
    advance(100)
    expect(face().hasAttribute("data-moment")).toBe(false)
    expect(screen.getByTestId("tick-dial").querySelector("g[data-motion]")).toBe(layer)
    expect(numberLayers()[0]).toEqual(["now", "1,300", "true"])
    advance(400)
    expect(badge().getAttribute("data-shown")).toBe("true")
  })

  it("does not play for a count-up away from its milestone day", () => {
    render(
      <DialClockProvider clock={fixedDialClock(dialDemoNowMs)}>
        <DialDashboard
          timers={dialDemoTimerList}
          defaultSelectedId="parcel"
          momentLedger={createMemoryMomentLedger()}
        />
      </DialClockProvider>,
    )
    advance(MOMENT_TIMELINE.end)
    expect(face().hasAttribute("data-moment")).toBe(false)
    expect(screen.queryByTestId("dial-milestone-badge")).not.toBeInTheDocument()
  })
})
