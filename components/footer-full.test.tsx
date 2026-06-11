import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FooterFull } from "@/components/footer-full"

describe("FooterFull", () => {
  it("renders the inactivity policy as plain text", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    expect(screen.getByText("Cloud data stays until you delete it.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cloud data stays until you delete it." })).not.toBeInTheDocument()
  })

  it("renders durable links without sitemap or robots entries", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs")
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/CorgiCorner/tickward",
    )
    expect(screen.getByRole("link", { name: "Press kit" })).toHaveAttribute("href", "/press")
    expect(screen.queryByRole("link", { name: "Sitemap" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Robots" })).not.toBeInTheDocument()
  })

  it("renders the copyright row with the release tag badge", () => {
    render(<FooterFull docsHref="/docs" releaseTag="v-test" />)

    expect(screen.getByText(/^tickward$/).parentElement).toHaveTextContent(/^tickward © \d{4}$/)
    expect(screen.getByText("v-test")).toHaveClass("rounded-full", "bg-muted", "font-mono")
  })
})
