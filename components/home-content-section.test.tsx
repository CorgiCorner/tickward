import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HomeContentSection } from "@/components/home-content-section"

describe("HomeContentSection", () => {
  it("renders the hero with the page's single h1 and description", () => {
    const { container } = render(<HomeContentSection />)
    const hero = screen.getByRole("heading", { level: 1, name: "Countdown timer to any date" }).parentElement

    expect(screen.getByRole("heading", { level: 1, name: "Countdown timer to any date" })).toBeInTheDocument()
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByText(/Count down, or up, to any moment/)).toBeInTheDocument()
    expect(hero).toHaveClass("text-center")
    expect(hero).not.toHaveClass("rounded-3xl", "border", "bg-background")
    expect(container.querySelector('[data-slot="home-seo-pattern"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="home-seo-pattern"] svg')).toHaveLength(42)
  })

  it("renders the feature blurbs", () => {
    render(<HomeContentSection />)

    expect(screen.getByRole("heading", { level: 2, name: "Sync across devices" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Share timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Embed timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Automate timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Open source" })).toBeInTheDocument()
    expect(screen.getByText(/Embed read-only countdowns/)).toBeInTheDocument()
    expect(screen.getByText(/REST API, webhooks, and MCP server/)).toBeInTheDocument()
  })

  it("does not render docs CTAs", () => {
    render(<HomeContentSection />)

    expect(screen.queryByRole("link", { name: "Read the docs" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Self-hosting guide" })).not.toBeInTheDocument()
  })

  it("does not register a competing landmark footer", () => {
    render(<HomeContentSection />)

    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument()
  })
})
