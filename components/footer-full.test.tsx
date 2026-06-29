import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FooterFull } from "@/components/footer-full"

vi.mock("@/lib/app-extensions", () => ({
  appExtensions: {
    marketingFooterSections: () => [
      {
        ariaLabel: "Use cases: By moment",
        heading: "By moment",
        links: [
          {
            href: "/en/use-cases/event-countdown-timer",
            label: "Event countdown",
            hrefLang: "en",
          },
        ],
      },
      {
        ariaLabel: "Use cases: By audience",
        heading: "By audience",
        links: [
          {
            href: "/en/use-cases/countdown-timer-for-teachers",
            label: "Teachers",
            hrefLang: "en",
          },
          { href: "/en/use-cases", label: "All use cases", hrefLang: "en" },
        ],
      },
    ],
  },
}))

describe("FooterFull", () => {
  it("renders the inactivity policy as plain text", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    expect(screen.getByText("Cloud data stays until you delete it.")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "Cloud data stays until you delete it.",
      }),
    ).not.toBeInTheDocument()
  })

  it("renders durable links without sitemap or robots entries", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    expect(screen.getByRole("navigation", { name: "Use cases: By moment" })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Use cases: By audience" })).toBeInTheDocument()
    expect(screen.getByText("By moment")).toBeInTheDocument()
    expect(screen.getByText("By audience")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "All use cases" })).toHaveAttribute("href", "/en/use-cases")
    expect(screen.getByRole("link", { name: "Event countdown" })).toHaveAttribute(
      "href",
      "/en/use-cases/event-countdown-timer",
    )
    expect(screen.getByRole("link", { name: "Teachers" })).toHaveAttribute(
      "href",
      "/en/use-cases/countdown-timer-for-teachers",
    )
    expect(
      screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/en/use-cases")),
    ).toHaveLength(3)
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs")
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/CorgiCorner/tickward",
    )
    expect(screen.getByRole("link", { name: "Press kit" })).toHaveAttribute("href", "/en/press")
    expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute("href", "https://status.tickward.com")
    expect(screen.queryByRole("link", { name: "Sitemap" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Robots" })).not.toBeInTheDocument()
  })

  it("lists global calendars first, then per-country, with the all-calendars link", () => {
    const marketingLinks = [
      { href: "/en/timers/zulu", label: "Zulu", hrefLang: "en" },
      { href: "/en/timers/golf", label: "Golf", hrefLang: "en" },
      { href: "/en/timers/alpha", label: "Alpha", hrefLang: "en" },
      { href: "/en/timers/oscar", label: "Oscar", hrefLang: "en", country: "US" },
      { href: "/en/timers/bravo", label: "Bravo", hrefLang: "en", country: "GB" },
      { href: "/en/timers/charlie", label: "Charlie", hrefLang: "en" },
      { href: "/en/timers/kilo", label: "Kilo", hrefLang: "en" },
      { href: "/en/timers/juliet", label: "Juliet", hrefLang: "en" },
      { href: "/en/timers/india", label: "India", hrefLang: "en" },
    ]

    render(<FooterFull docsHref="/docs" releaseTag="v-test" marketingLinks={marketingLinks} />)

    const calendars = screen.getByRole("navigation", {
      name: "Ready-made calendars",
    })

    const links = within(calendars).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual([
      // global (no-country) calendars first, sorted by label
      "Alpha",
      "Charlie",
      "Golf",
      "India",
      "Juliet",
      "Kilo",
      "Zulu",
      // then per-country calendars, sorted by label
      "Bravo",
      "Oscar",
      "All calendars",
    ])
    expect(screen.getByRole("link", { name: "Oscar" })).toHaveAttribute("href", "/en/timers/oscar")
    expect(screen.getByRole("link", { name: "Bravo" })).toHaveAttribute("href", "/en/timers/bravo")
    // The footer lists flat calendar links, not country headings.
    expect(within(calendars).queryByText("United Kingdom")).not.toBeInTheDocument()
    expect(within(calendars).queryByText("United States")).not.toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "All calendars" })).toHaveLength(1)
    expect(screen.getByRole("link", { name: "All calendars" })).toHaveAttribute("href", "/en/timers")
  })

  it("renders the copyright row with the release tag badge", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    const copyright = screen
      .getAllByText(/^tickward$/)
      .map((node) => node.parentElement)
      .find((parent) => /^tickward © \d{4}$/.test(parent?.textContent ?? ""))
    expect(copyright).toBeTruthy()
    expect(screen.getByText("v-test")).toHaveClass("rounded", "bg-muted", "font-mono")
  })
})
