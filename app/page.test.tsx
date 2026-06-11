import type { ReactElement } from "react"
import { Suspense } from "react"
import { describe, expect, it, vi } from "vitest"

import Home from "@/app/page"
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

// The page component is synchronous; only the Suspense-wrapped personalized
// child awaits cookies/headers. Inspecting the returned element tree verifies
// what hydration can and cannot remove without rendering server internals.
function pageChildren(): PageChild[] {
  const page = Home() as ReactElement<{ children: PageChild[] }>
  return page.props.children.filter(Boolean)
}

describe("Home page shell", () => {
  it("keeps the SoftwareApplication JSON-LD script", () => {
    const script = pageChildren().find((child) => child.type === "script")

    expect(script?.props.dangerouslySetInnerHTML?.__html).toContain('"@type":"SoftwareApplication"')
  })

  it("renders the hero content section and site footer outside the Suspense boundary", () => {
    const types = pageChildren().map((child) => child.type)
    const suspenseIndex = types.indexOf(Suspense)

    expect(suspenseIndex).toBeGreaterThanOrEqual(0)
    expect(types.indexOf(HomeContentSection)).toBeGreaterThan(suspenseIndex)
    expect(types.indexOf(SiteFooter)).toBeGreaterThan(types.indexOf(HomeContentSection))
  })
})
