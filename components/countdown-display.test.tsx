import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CountdownDisplay } from "@/components/countdown-display"

describe("CountdownDisplay", () => {
  it("renders padded countdown units", () => {
    render(
      <CountdownDisplay targetDateIsoUtc="2026-05-26T01:02:03.000Z" nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />,
    )

    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("01")).toBeInTheDocument()
    expect(screen.getByText("02")).toBeInTheDocument()
    expect(screen.getByText("03")).toBeInTheDocument()
    expect(screen.getByText("days")).toBeInTheDocument()
    expect(screen.getByText("hours")).toBeInTheDocument()
    expect(screen.getByText("mins")).toBeInTheDocument()
    expect(screen.getByText("secs")).toBeInTheDocument()
  })

  it("labels count-up values from past dates", () => {
    render(
      <CountdownDisplay targetDateIsoUtc="2026-05-23T00:00:00.000Z" nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />,
    )

    expect(screen.getByText("Since")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
  })
})
