import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FooterFull } from "@/components/footer-full"

vi.mock("@/lib/app-extensions", () => ({
  appExtensions: {
    marketingFooterSections: () => [
      {
        ariaLabel: "Use cases: By moment",
        heading: "By moment",
        links: [{ href: "/use-cases/event-countdown-timer", label: "Event countdown", hrefLang: "en" }],
      },
      {
        ariaLabel: "Use cases: By audience",
        heading: "By audience",
        links: [
          { href: "/use-cases/countdown-timer-for-teachers", label: "Teachers", hrefLang: "en" },
          { href: "/use-cases", label: "All use cases", hrefLang: "en" },
        ],
      },
    ],
  },
}))

describe("FooterFull", () => {
  it("renders the inactivity policy as plain text", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    expect(screen.getByText("Cloud data stays until you delete it.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cloud data stays until you delete it." })).not.toBeInTheDocument()
  })

  it("renders durable links without sitemap or robots entries", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    expect(screen.getByRole("navigation", { name: "Use cases: By moment" })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Use cases: By audience" })).toBeInTheDocument()
    expect(screen.getByText("By moment")).toBeInTheDocument()
    expect(screen.getByText("By audience")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "All use cases" })).toHaveAttribute("href", "/use-cases")
    expect(screen.getByRole("link", { name: "Event countdown" })).toHaveAttribute(
      "href",
      "/use-cases/event-countdown-timer",
    )
    expect(screen.getByRole("link", { name: "Teachers" })).toHaveAttribute(
      "href",
      "/use-cases/countdown-timer-for-teachers",
    )
    expect(
      screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/use-cases")),
    ).toHaveLength(3)
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs")
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/CorgiCorner/tickward",
    )
    expect(screen.getByRole("link", { name: "Press kit" })).toHaveAttribute("href", "/press")
    expect(screen.queryByRole("link", { name: "Sitemap" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Robots" })).not.toBeInTheDocument()
  })

  it("caps locale-native entry links and keeps the all-calendars link", () => {
    const marketingLinks = Array.from({ length: 16 }, (_, index) => ({
      href: `/timers/entry-${index + 1}`,
      label: `Entry ${index + 1}`,
      hrefLang: "en",
    }))

    render(<FooterFull docsHref="/docs" releaseTag="v-test" marketingLinks={marketingLinks} />)

    expect(screen.getByRole("link", { name: "Entry 1" })).toHaveAttribute("href", "/timers/entry-1")
    expect(screen.getByRole("link", { name: "Entry 15" })).toHaveAttribute("href", "/timers/entry-15")
    expect(screen.queryByRole("link", { name: "Entry 16" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "All calendars" })).toHaveAttribute("href", "/timers")
  })

  it("renders the copyright row with the release tag badge", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    const copyright = screen
      .getAllByText(/^tickward$/)
      .map((node) => node.parentElement)
      .find((parent) => /^tickward © \d{4}$/.test(parent?.textContent ?? ""))
    expect(copyright).toBeTruthy()
    expect(screen.getByText("v-test")).toHaveClass("rounded-full", "bg-muted", "font-mono")
  })
})
