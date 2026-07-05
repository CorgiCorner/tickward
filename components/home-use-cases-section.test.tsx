import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("HomeUseCasesSection", () => {
  afterEach(() => {
    cleanup()
    vi.doUnmock("@/lib/app-extensions")
    vi.resetModules()
  })

  it("renders real use-case links with hrefLang markers when the extension is present", async () => {
    vi.doUnmock("@/lib/app-extensions")
    const { appExtensions } = await import("@/lib/app-extensions")
    if (!appExtensions.marketingHomeUseCases) {
      expect(appExtensions.marketingHomeUseCases).toBeUndefined()
      return
    }

    const { HomeUseCasesSection } = await import("@/components/home-use-cases-section")

    render(<HomeUseCasesSection locale="en" />)

    expect(screen.getByRole("heading", { name: "Popular countdown timers" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Event countdown" })).toHaveAttribute(
      "href",
      "/en/use-cases/event-countdown-timer",
    )
    const links = screen.getAllByRole("link")
    expect(links.some((link) => link.getAttribute("href") === "/en/use-cases")).toBe(true)
    for (const link of links) {
      expect(link).toHaveAttribute("hreflang", "en")
    }
  })

  it("renders nothing when the extension has no home use cases", async () => {
    vi.doMock("@/lib/app-extensions", () => ({ appExtensions: {} }))
    const { HomeUseCasesSection } = await import("@/components/home-use-cases-section")

    const { container } = render(<HomeUseCasesSection locale="en" />)

    expect(container).toBeEmptyDOMElement()
  })
})
