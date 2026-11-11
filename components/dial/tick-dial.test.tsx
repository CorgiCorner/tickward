import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DialReadout } from "./dial-readout"
import { TickDial } from "./tick-dial"

function litLayer() {
  return screen.getByTestId("tick-dial").querySelector("g[data-motion]")!
}

describe("TickDial", () => {
  it("draws a resting and a lit layer of 60 ticks each", () => {
    render(<TickDial progress={20.5} />)
    const dial = screen.getByTestId("tick-dial")
    expect(dial.querySelectorAll("line")).toHaveLength(120)
    const lit = litLayer().querySelectorAll("line")
    expect(lit[19].getAttribute("data-state")).toBe("lit")
    expect(lit[20].getAttribute("data-state")).toBe("leading")
    expect(Number((lit[20] as SVGLineElement).style.opacity)).toBeCloseTo(0.59)
    expect(lit[21].getAttribute("data-state")).toBe("rest")
  })

  it("makes every fifth tick longer", () => {
    render(<TickDial progress={0} />)
    const lit = litLayer().querySelectorAll("line")
    expect(lit[0].getAttribute("y2")).toBe("44")
    expect(lit[1].getAttribute("y2")).toBe("40")
    expect(lit[5].getAttribute("y2")).toBe("44")
  })

  it("sweeps only when the timer changes, not on the first render or a live tick", () => {
    const { rerender } = render(<TickDial progress={10} timerKey="train" />)
    expect(litLayer().getAttribute("data-motion")).toBe("none")
    rerender(<TickDial progress={10.2} timerKey="train" />)
    expect(litLayer().getAttribute("data-motion")).toBe("none")
    rerender(<TickDial progress={40} timerKey="herbs" />)
    expect(litLayer().getAttribute("data-motion")).toBe("select")
  })

  it("replays the round for a milestone moment", () => {
    const { rerender } = render(<TickDial progress={60} timerKey="met" />)
    const before = litLayer()
    rerender(<TickDial progress={60} timerKey="met" momentRun={1} momentSweep />)
    expect(litLayer().getAttribute("data-motion")).toBe("moment")
    const moment = litLayer()
    expect(moment).not.toBe(before)
    rerender(<TickDial progress={60} timerKey="met" momentRun={1} />)
    expect(litLayer()).toBe(moment)
    expect(litLayer().getAttribute("data-motion")).toBe("none")
  })
})

describe("DialReadout", () => {
  it("stacks number, unit and clock with a tight thousands separator", () => {
    render(<DialReadout value={1300} unit="days" clock="00:12:44" />)
    const readout = screen.getByTestId("dial-readout")
    expect(readout).toHaveTextContent("1,300days00:12:44")
    expect(readout.querySelector("[data-long]")?.getAttribute("data-long")).toBe("true")
  })

  it("keeps the previous number until the roll settles", () => {
    const { rerender } = render(
      <DialReadout value={1300} previousValue={1299} settled={false} unit="days" clock="00:00:01" />,
    )
    const layers = () => screen.getByTestId("dial-readout").querySelectorAll("[data-role]")
    expect(layers()[0].getAttribute("data-shown")).toBe("false")
    expect(layers()[1].getAttribute("data-shown")).toBe("true")
    rerender(<DialReadout value={1300} previousValue={1299} settled unit="days" clock="00:00:01" />)
    expect(layers()[0].getAttribute("data-shown")).toBe("true")
    expect(layers()[1].getAttribute("data-shown")).toBe("false")
  })
})
