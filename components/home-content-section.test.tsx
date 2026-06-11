import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HomeContentSection } from "@/components/home-content-section"

describe("HomeContentSection", () => {
  it("renders the hero with the page's single h1 and description", () => {
    const { container } = render(<HomeContentSection />)
    const hero = screen.getByRole("heading", { level: 1, name: "Countdown Timer to Any Date" }).parentElement

    expect(screen.getByRole("heading", { level: 1, name: "Countdown Timer to Any Date" })).toBeInTheDocument()
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByText(/Create a Countdown Timer that counts down/)).toBeInTheDocument()
    expect(hero).toHaveClass("mx-auto", "max-w-[560px]", "text-center")
    expect(hero).not.toHaveClass("rounded-3xl", "border", "bg-background")
  })

  it("renders the feature blurbs", () => {
    render(<HomeContentSection />)

    expect(screen.getByRole("heading", { level: 2, name: "More ways to use timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Sync across devices" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Share timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Embed timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Automate timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Open source" })).toBeInTheDocument()
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
