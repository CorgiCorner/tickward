import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SiteFooter } from "@/components/site-footer"

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
})
