import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

async function renderHomeContentSection() {
  const { HomeContentSection } = await import("@/components/home-content-section")
  return render(<HomeContentSection />)
}

describe("HomeContentSection", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/app-extensions")
    vi.resetModules()
  })

  it("renders the hero with the page's single h1 and description", async () => {
    const { container } = await renderHomeContentSection()
    const hero = screen.getByRole("heading", { level: 1, name: "Countdown timer to any date" }).parentElement

    expect(screen.getByRole("heading", { level: 1, name: "Countdown timer to any date" })).toBeInTheDocument()
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByText(/free online countdown timer/i)).toBeInTheDocument()
    expect(screen.getByText(/Every timer is pinned to a time zone/)).toBeInTheDocument()
    expect(screen.getByText(/Revoking the share turns off the link/)).toBeInTheDocument()
    expect(hero).toHaveClass("text-center")
    expect(hero).not.toHaveClass("rounded-3xl", "border", "bg-background")
    expect(container.querySelector('[data-slot="home-seo-pattern"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="home-seo-pattern"] svg')).toHaveLength(42)
  })

  it("renders the feature blurbs", async () => {
    await renderHomeContentSection()

    expect(screen.getByRole("heading", { level: 2, name: "Sync across devices" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Share timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Embed timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Automate timers" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Open source" })).toBeInTheDocument()
    expect(screen.getByText(/Embed read-only countdowns/)).toBeInTheDocument()
    expect(screen.getByText(/REST API, webhooks, and MCP server/)).toBeInTheDocument()
  })

  it("links the embedding feature when the extension exposes a target", async () => {
    const { appExtensions } = await import("@/lib/app-extensions")
    const embedHref = appExtensions.marketingHomeEmbedHref?.()

    await renderHomeContentSection()

    if (embedHref) {
      expect(screen.getByRole("link", { name: "Get the widget" })).toHaveAttribute("href", embedHref)
    } else {
      expect(screen.queryByRole("link", { name: "Get the widget" })).not.toBeInTheDocument()
    }
  })

  it("renders the embedding feature without a link when the extension is absent", async () => {
    vi.doMock("@/lib/app-extensions", () => ({ appExtensions: {} }))
    await renderHomeContentSection()

    expect(screen.getByRole("heading", { level: 2, name: "Embed timers" })).toBeInTheDocument()
    expect(screen.getByText(/Embed read-only countdowns/)).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Get the widget" })).not.toBeInTheDocument()
  })

  it("does not render docs CTAs", async () => {
    await renderHomeContentSection()

    expect(screen.queryByRole("link", { name: "Read the docs" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Self-hosting guide" })).not.toBeInTheDocument()
  })

  it("does not register a competing landmark footer", async () => {
    await renderHomeContentSection()

    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument()
  })
})
