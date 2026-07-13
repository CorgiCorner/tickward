import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ADMIN_COPY } from "@/components/admin/admin-copy"
import { defaultEntitlementsTable } from "@/lib/entitlements"

const mocks = vi.hoisted(() => ({
  getAdminStats: vi.fn(),
  getEntitlementsTable: vi.fn(),
  getCurrentActor: vi.fn(),
  hasAnyAdmin: vi.fn(),
  headers: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  timerStoreProvider: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}))

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}))

vi.mock("@/components/footer-full", () => ({
  FooterFull: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/header", () => ({
  Header: () => <header data-testid="header" />,
}))

vi.mock("@/components/admin/plan-entitlements-editor", () => ({
  PlanEntitlementsEditor: () => <div data-testid="plan-entitlements-editor" />,
}))

vi.mock("@/lib/actor.server", () => ({
  getCurrentActor: mocks.getCurrentActor,
}))

vi.mock("@/lib/admin-stats.server", () => ({
  getAdminStats: mocks.getAdminStats,
}))

vi.mock("@/lib/admin-bootstrap.server", () => ({
  hasAnyAdmin: mocks.hasAnyAdmin,
}))

vi.mock("@/lib/entitlements.server", () => ({
  getEntitlementsTable: mocks.getEntitlementsTable,
}))

vi.mock("@/lib/store", () => ({
  TimerStoreProvider: ({ children, initialState }: { children: ReactNode; initialState?: { activePlan?: string } }) => {
    mocks.timerStoreProvider(initialState)
    return <>{children}</>
  },
}))

import AdminPage from "./page"

function pageProps() {
  return { params: Promise.resolve({ locale: "en" }) }
}

function stats() {
  const daily = Array.from({ length: 30 }, (_, index) => ({
    day: `2026-07-${String(index + 1).padStart(2, "0")}`,
    count: index,
  }))

  return {
    generatedAt: "2026-07-07T12:00:00.000Z",
    users: { total: 1, new7d: 1, new30d: 1, banned: 0, activeSessions: 1, dailySignups: daily },
    usage: {
      timersActive: 1,
      timersArchived: 0,
      dailyTimersCreated: daily,
      projectsOwned: 1,
      projectsOwnerless: 0,
      sharesTotal: 0,
      pushSubscriptionsActive: 0,
    },
    integrations: {
      apiKeysActive: 0,
      apiKeysRevoked: 0,
      apiKeysUsed7d: 0,
      apiKeysByKind: [],
      mcpGrantsTotal: 0,
      mcpGrantsActive: 0,
      deviceGrantsTotal: 0,
      deviceGrantsActive: 0,
      webhookEndpointsByStatus: [],
    },
    notifications: {
      deliveryByChannel7d: [],
      outboxByStatus: [],
      outboxPending: 0,
      webhookDeliveriesByStatus7d: [],
      recentWebhookFailures: [],
    },
  }
}

describe("admin page guard", () => {
  beforeEach(() => {
    mocks.getAdminStats.mockReset()
    mocks.getAdminStats.mockResolvedValue(stats())
    mocks.getCurrentActor.mockReset()
    mocks.getCurrentActor.mockResolvedValue({
      kind: "user",
      user: { email: "ada@example.com", id: "user_123", role: "admin" },
    })
    mocks.headers.mockReset()
    mocks.headers.mockResolvedValue(new Headers({ host: "tickward.test", "x-forwarded-proto": "https" }))
    mocks.notFound.mockReset()
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND")
    })
    mocks.redirect.mockReset()
    mocks.redirect.mockImplementation((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`)
    })
    mocks.timerStoreProvider.mockReset()
    mocks.hasAnyAdmin.mockReset()
    mocks.hasAnyAdmin.mockResolvedValue(true)
    mocks.getEntitlementsTable.mockReset()
    mocks.getEntitlementsTable.mockResolvedValue(defaultEntitlementsTable())
  })

  it("redirects anonymous actors to sign in with the admin path as next", async () => {
    mocks.getCurrentActor.mockResolvedValueOnce({ kind: "anonymous", restoreKey: "restore_123" })

    await expect(AdminPage(pageProps())).rejects.toThrow("NEXT_REDIRECT")

    const redirectTarget = String(mocks.redirect.mock.calls[0]?.[0])
    expect(redirectTarget).toMatch(/^\/en\/sign-in\?next=/)
    expect(new URL(redirectTarget, "https://tickward.test").searchParams.get("next")).toBe("/en/admin")
    expect(mocks.hasAnyAdmin).toHaveBeenCalledTimes(1)
    expect(mocks.getAdminStats).not.toHaveBeenCalled()
  })

  it("returns not found for signed-in non-admin actors", async () => {
    mocks.getCurrentActor.mockResolvedValueOnce({
      kind: "user",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })

    await expect(AdminPage(pageProps())).rejects.toThrow("NEXT_NOT_FOUND")

    expect(mocks.notFound).toHaveBeenCalledTimes(1)
    expect(mocks.getAdminStats).not.toHaveBeenCalled()
  })

  it("redirects signed-in non-admin users to setup when no administrator exists", async () => {
    mocks.getCurrentActor.mockResolvedValueOnce({
      kind: "user",
      user: { email: "ada@example.com", id: "user_123", role: "user" },
    })
    mocks.hasAnyAdmin.mockResolvedValue(false)

    await expect(AdminPage(pageProps())).rejects.toThrow("NEXT_REDIRECT:/en/setup")

    expect(mocks.hasAnyAdmin).toHaveBeenCalledTimes(1)
    expect(mocks.notFound).not.toHaveBeenCalled()
    expect(mocks.getAdminStats).not.toHaveBeenCalled()
  })

  it("renders the admin statistics page for admin actors", async () => {
    render(await AdminPage(pageProps()))

    expect(screen.getByRole("heading", { name: ADMIN_COPY.sections.users.heading })).toBeVisible()
    expect(document.querySelector("main")).toHaveClass("max-w-[640px]")
    expect(mocks.getAdminStats).toHaveBeenCalledTimes(1)
    expect(mocks.timerStoreProvider).toHaveBeenCalledWith(expect.objectContaining({ activePlan: "free" }))
  })

  it("keeps recent webhook failures readable in the narrow admin column", async () => {
    const baseStats = stats()
    mocks.getAdminStats.mockResolvedValueOnce({
      ...baseStats,
      notifications: {
        ...baseStats.notifications,
        recentWebhookFailures: [
          {
            attemptCount: 3,
            endpointId: "endpoint_1234567890abcdef",
            error: "Connection timed out",
            failedAt: "2026-07-07T12:30:00.000Z",
            id: "delivery_123",
            responseStatus: 500,
          },
        ],
      },
    })

    render(await AdminPage(pageProps()))

    const table = screen.getByRole("table", { name: ADMIN_COPY.tables.recentWebhookFailures.caption })
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4)
    expect(within(table).getByText("endpoint_1234567890abcdef")).toBeVisible()
    expect(within(table).getByText("Connection timed out")).toBeVisible()
    expect(within(table).getByText("500")).toBeVisible()
    expect(within(table).getByText("3")).toBeVisible()
  })
})
