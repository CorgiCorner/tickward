import type { ReactElement } from "react"
import { Suspense } from "react"
import { describe, expect, it, vi } from "vitest"

import Home from "@/app/[locale]/page"
import { DesktopAppPromo } from "@/components/desktop-app-promo"
import { FaqSection } from "@/components/faq-section"
import { GitHubStarCta } from "@/components/github-star-cta"
import { HomeContentSection } from "@/components/home-content-section"
import { HomeUseCasesSection } from "@/components/home-use-cases-section"
import { SiteFooter } from "@/components/site-footer"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: vi.fn(),
}))

vi.mock("@/lib/account-preferences.server", () => ({
  getAccountPreferencesForUser: vi.fn(),
}))

vi.mock("@/lib/cookies.server", () => ({
  readRestoreKeyCookie: vi.fn(),
  readSpacesCookie: vi.fn(),
  readTimersCookie: vi.fn(),
}))

vi.mock("@/components/home-client", () => ({
  HomeClient: () => null,
}))

type PageChild = ReactElement<{
  children?: PageChild | PageChild[]
  dangerouslySetInnerHTML?: { __html: string }
}>

// Only the Suspense-wrapped personalized child awaits cookies/headers; the
// page itself just resolves its locale param. Inspecting the returned element
// tree verifies what hydration can and cannot remove without rendering server
// internals.
async function pageChildren(locale = "en"): Promise<PageChild[]> {
  const page = (await Home({ params: Promise.resolve({ locale }) })) as ReactElement<{ children: PageChild[] }>
  return page.props.children.filter(Boolean)
}

describe("Home page shell", () => {
  it("keeps the SoftwareApplication JSON-LD script", async () => {
    const script = (await pageChildren()).find((child) => child.type === "script")

    expect(script?.props.dangerouslySetInnerHTML?.__html).toContain('"@type":"SoftwareApplication"')
  })

  it("keeps the FAQPage JSON-LD script", async () => {
    const scripts = (await pageChildren()).filter((child) => child.type === "script")

    expect(scripts.some((script) => script.props.dangerouslySetInnerHTML?.__html.includes('"@type":"FAQPage"'))).toBe(
      true,
    )
  })

  it("renders the desktop app promo directly below FAQ and before use cases", async () => {
    const children = await pageChildren()
    const types = children.map((child) => child.type)
    const suspenseIndex = types.indexOf(Suspense)
    const contentIndex = types.indexOf(HomeContentSection)
    const desktopPromoIndex = types.indexOf(DesktopAppPromo)
    const starCtaIndex = types.indexOf(GitHubStarCta)
    const faqIndex = children.findIndex((child) => {
      const nested = child.props.children
      return !Array.isArray(nested) && nested?.type === FaqSection
    })
    const useCasesIndex = types.indexOf(HomeUseCasesSection)

    expect(suspenseIndex).toBeGreaterThanOrEqual(0)
    expect(contentIndex).toBeGreaterThan(suspenseIndex)
    expect(starCtaIndex).toBe(contentIndex + 1)
    expect(faqIndex).toBeGreaterThan(starCtaIndex)
    expect(desktopPromoIndex).toBe(faqIndex + 1)
    expect(useCasesIndex).toBe(desktopPromoIndex + 1)
    expect(types.indexOf(SiteFooter)).toBeGreaterThan(useCasesIndex)
  })

  it("renders the Polish home page from the same component", async () => {
    const types = (await pageChildren("pl")).map((child) => child.type)

    expect(types.indexOf(HomeContentSection)).toBeGreaterThanOrEqual(0)
  })

  it("404s unsupported locales", async () => {
    await expect(Home({ params: Promise.resolve({ locale: "fr" }) })).rejects.toThrow()
  })
})
