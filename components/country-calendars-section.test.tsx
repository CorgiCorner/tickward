import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CountryCalendarsSection } from "@/components/country-calendars-section"

vi.mock("@/lib/app-extensions", () => ({
  appExtensions: {
    marketingCountryCalendars: () => [
      {
        code: "GB",
        countryLabel: "United Kingdom",
        links: [{ href: "/en/timers/uk-a", label: "UK A", hrefLang: "en", country: "GB" }],
      },
      {
        code: "PL",
        countryLabel: "Poland",
        links: [{ href: "/pl/timers/pl-a", label: "PL A", hrefLang: "pl", country: "PL" }],
      },
    ],
  },
}))

describe("CountryCalendarsSection", () => {
  it("renders each country group and the all-calendars link", () => {
    const { container } = render(<CountryCalendarsSection locale="en" />)

    const section = screen.getByRole("region", { name: "Calendars by country" })
    expect(within(section).getByText("United Kingdom")).toBeInTheDocument()
    expect(within(section).getByText("Poland")).toBeInTheDocument()
    expect(container.querySelectorAll("svg")).toHaveLength(2)
    expect(screen.getByRole("link", { name: "UK A" })).toHaveAttribute("href", "/en/timers/uk-a")
    expect(screen.getByRole("link", { name: "PL A" })).toHaveAttribute("href", "/pl/timers/pl-a")
    expect(screen.getByRole("link", { name: "All calendars" })).toHaveAttribute("href", "/en/timers")
  })
})
