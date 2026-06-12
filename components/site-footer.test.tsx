import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SiteFooter } from "@/components/site-footer"

vi.mock("@/lib/app-extensions", () => ({
  appExtensions: {
    marketingFooterLinks: () => [{ href: "/timers/example-set", label: "Example set", hrefLang: "pl" }],
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
    expect(screen.getByRole("link", { name: "Press kit" })).toHaveAttribute("href", "/press")
    expect(screen.queryByRole("link", { name: "Sitemap" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Robots" })).not.toBeInTheDocument()
    expect(screen.getByText("Cloud data stays until you delete it.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cloud data stays until you delete it." })).not.toBeInTheDocument()
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument()
  })

  it("shows curated entry links only on pages of the matching locale", () => {
    render(<SiteFooter />)
    expect(screen.queryByRole("link", { name: "Example set" })).not.toBeInTheDocument()

    render(<SiteFooter locale="pl" />)
    const link = screen.getByRole("link", { name: "Example set" })
    expect(link).toHaveAttribute("href", "/timers/example-set")
    expect(screen.getByRole("link", { name: "Wszystkie kalendarze" })).toHaveAttribute("href", "/pl/timers")
  })
})
