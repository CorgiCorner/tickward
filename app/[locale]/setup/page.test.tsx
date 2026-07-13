import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { defaultEntitlementsTable } from "@/lib/entitlements"

const mocks = vi.hoisted(() => ({
  hasAnyAdmin: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/admin-bootstrap.server", () => ({ hasAnyAdmin: mocks.hasAnyAdmin }))
vi.mock("@/lib/entitlements.server", () => ({
  getActivePlanForCurrentRequest: async () => "anonymous",
  getEntitlementsTable: async () => defaultEntitlementsTable(),
}))
vi.mock("@/components/admin/admin-bootstrap-client", () => ({
  AdminBootstrapClient: () => <main>Bootstrap form</main>,
}))
vi.mock("@/components/footer-full", () => ({ FooterFull: () => <footer /> }))
vi.mock("@/components/header", () => ({ Header: () => <header /> }))
vi.mock("@/lib/store", () => ({
  TimerStoreProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import SetupPage from "./page"

describe("setup page", () => {
  beforeEach(() => {
    mocks.hasAnyAdmin.mockReset()
    mocks.hasAnyAdmin.mockResolvedValue(false)
    mocks.redirect.mockReset()
    mocks.redirect.mockImplementation((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`)
    })
  })

  it("redirects home when an administrator already exists", async () => {
    mocks.hasAnyAdmin.mockResolvedValue(true)

    await expect(SetupPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow("NEXT_REDIRECT:/")
  })

  it("renders onboarding while the administrator slot is open", async () => {
    render(await SetupPage({ params: Promise.resolve({ locale: "en" }) }))

    expect(screen.getByRole("main")).toHaveTextContent("Bootstrap form")
  })
})
