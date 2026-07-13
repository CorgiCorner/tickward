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
      {
        code: "DE",
        countryLabel: "Germany",
        links: [{ href: "/de/calendars/de-a", label: "DE A", hrefLang: "de", country: "DE" }],
      },
      {
        code: "AU",
        countryLabel: "Australia",
        links: [{ href: "/en/calendars/au-a", label: "AU A", hrefLang: "en", country: "AU" }],
      },
    ],
  },
}))

describe("CountryCalendarsSection", () => {
  it("renders each country group and the all-calendars link", () => {
    render(<CountryCalendarsSection locale="en" />)

    const section = screen.getByRole("region", { name: "Calendars by country" })
    expect(within(section).getByText("United Kingdom")).toBeInTheDocument()
    expect(within(section).getByText("Poland")).toBeInTheDocument()
    expect(within(section).getByText("Germany")).toBeInTheDocument()
    expect(within(section).getByText("Australia")).toBeInTheDocument()
    // Every country group renders its flag; a code missing from the flag
    // whitelist silently drops the icon. Scoped to the section so unrelated
    // page SVGs never skew the count.
    expect(section.querySelectorAll("svg")).toHaveLength(4)
    expect(screen.getByRole("link", { name: "UK A" })).toHaveAttribute("href", "/en/timers/uk-a")
    expect(screen.getByRole("link", { name: "PL A" })).toHaveAttribute("href", "/pl/timers/pl-a")
    expect(screen.getByRole("link", { name: "All calendars" })).toHaveAttribute("href", "/en/timers")
  })
})
