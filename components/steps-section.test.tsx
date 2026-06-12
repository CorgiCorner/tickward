import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StepsSection } from "@/components/steps-section"

describe("StepsSection", () => {
  it("renders a heading, step titles, and numbered markers", () => {
    render(
      <StepsSection
        heading="How to create your event countdown timer"
        steps={[
          { title: "Pick the date", body: "Choose the exact date and time your event begins." },
          { title: "Share the timer", body: "Send the link to the people following along." },
          { title: "Keep it visible", body: "Pin the countdown where you will see it first." },
        ]}
      />,
    )

    expect(
      screen.getByRole("heading", { level: 2, name: "How to create your event countdown timer" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Pick the date" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Share the timer" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Keep it visible" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })
})
