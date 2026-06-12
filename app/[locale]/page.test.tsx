import type { ReactElement } from "react"
import { Suspense } from "react"
import { describe, expect, it, vi } from "vitest"

import Home from "@/app/[locale]/page"
import { HomeContentSection } from "@/components/home-content-section"
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

type PageChild = ReactElement<{ dangerouslySetInnerHTML?: { __html: string } }>

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

  it("renders the hero content section and site footer outside the Suspense boundary", async () => {
    const types = (await pageChildren()).map((child) => child.type)
    const suspenseIndex = types.indexOf(Suspense)

    expect(suspenseIndex).toBeGreaterThanOrEqual(0)
    expect(types.indexOf(HomeContentSection)).toBeGreaterThan(suspenseIndex)
    expect(types.indexOf(SiteFooter)).toBeGreaterThan(types.indexOf(HomeContentSection))
  })

  it("renders the Polish home page from the same component", async () => {
    const types = (await pageChildren("pl")).map((child) => child.type)

    expect(types.indexOf(HomeContentSection)).toBeGreaterThanOrEqual(0)
  })

  it("404s unsupported locales", async () => {
    await expect(Home({ params: Promise.resolve({ locale: "fr" }) })).rejects.toThrow()
  })
})
