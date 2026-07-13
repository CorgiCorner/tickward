import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DailyBarChart } from "@/components/admin/daily-bar-chart"

describe("DailyBarChart", () => {
  it("renders a compact nice-scaled chart without zero-count bars", () => {
    const { container } = render(
      <DailyBarChart
        ariaLabel="Daily activity"
        points={[
          { count: 1, day: "2026-07-01" },
          { count: 3, day: "2026-07-02" },
          { count: 0, day: "2026-07-03" },
        ]}
      />,
    )

    const chart = screen.getByRole("img", { name: "Daily activity" })
    expect(chart).toHaveAttribute("viewBox", "0 0 640 170")
    expect(chart).toHaveClass("h-40")
    expect(screen.getByText("5")).toBeVisible()
    expect(screen.getByText("3")).toBeVisible()
    expect(screen.getByText("07-01")).toBeVisible()
    expect(screen.getByText("07-03")).toBeVisible()
    expect(container.querySelectorAll("rect")).toHaveLength(2)
  })
})
