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

  it("shows the previous and next derived milestone for since timers", () => {
    render(
      <CountdownDisplay
        targetDateIsoUtc="2024-01-01T10:00:00.000Z"
        nowMs={Date.parse("2026-06-01T00:00:00.000Z")}
        timer={{
          mode: "since",
          targetDate: "2024-01-01T10:00:00.000Z",
          timezone: "UTC",
          milestones: { rules: [{ unit: "years", every: 1 }] },
        }}
      />,
    )

    expect(screen.getByText(/Next: 3 years/)).toBeInTheDocument()
    expect(screen.getByText(/Last: 2 years/)).toBeInTheDocument()
  })

  it("uses the singular unit label for a one-unit milestone", () => {
    render(
      <CountdownDisplay
        targetDateIsoUtc="2024-01-01T10:00:00.000Z"
        nowMs={Date.parse("2024-06-01T10:00:00.000Z")}
        timer={{
          mode: "since",
          targetDate: "2024-01-01T10:00:00.000Z",
          timezone: "UTC",
          milestones: { rules: [{ unit: "years", every: 1 }] },
        }}
      />,
    )

    expect(screen.getByText(/Next: 1 year/)).toBeInTheDocument()
  })

  it("shows when a finite milestone ladder is complete", () => {
    render(
      <CountdownDisplay
        targetDateIsoUtc="2024-01-01T10:00:00.000Z"
        nowMs={Date.parse("2024-02-01T10:00:00.000Z")}
        timer={{
          mode: "since",
          targetDate: "2024-01-01T10:00:00.000Z",
          timezone: "UTC",
          milestones: { rules: [{ unit: "days", at: [1, 3] }] },
        }}
      />,
    )

    expect(screen.getByText("Milestone ladder complete")).toBeVisible()
    expect(screen.getByText(/Last: 3 days/)).toBeVisible()
  })
})
