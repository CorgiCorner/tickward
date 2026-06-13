import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SiteFooter } from "@/components/site-footer"

vi.mock("@/lib/app-extensions", () => ({
  appExtensions: {
    marketingFooterLinks: () => [{ href: "/en/timers/example-set", label: "Example set", hrefLang: "en" }],
  },
}))

describe("SiteFooter", () => {
  it("renders as the page-level contentinfo landmark", () => {
    render(<SiteFooter />)

    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
  })

  it("renders the settled site-wide footer content", () => {
    render(<SiteFooter />)

    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs")
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/CorgiCorner/tickward",
    )
    expect(screen.getByRole("link", { name: "Press kit" })).toHaveAttribute("href", "/en/press")
    expect(screen.queryByRole("link", { name: "Sitemap" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Robots" })).not.toBeInTheDocument()
    expect(screen.getByText("Cloud data stays until you delete it.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cloud data stays until you delete it." })).not.toBeInTheDocument()
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument()
  })

  it("shows the global calendars on every locale, with the locale's all-calendars link", () => {
    const { unmount } = render(<SiteFooter />)
    expect(screen.getByRole("link", { name: "Example set" })).toHaveAttribute("href", "/en/timers/example-set")
    expect(screen.getByRole("link", { name: "All calendars" })).toHaveAttribute("href", "/en/timers")
    unmount()

    render(<SiteFooter locale="pl" />)
    expect(screen.getByRole("link", { name: "Example set" })).toHaveAttribute("href", "/en/timers/example-set")
    expect(screen.getByRole("link", { name: "Wszystkie kalendarze" })).toHaveAttribute("href", "/pl/timers")
  })
})
