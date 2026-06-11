import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  AppHeaderLoadingSkeleton,
  AuthPageLoading,
  AppShellLoading,
  HomePageLoading,
  HomeMainLoadingSkeleton,
  OrganizerBarLoadingSkeleton,
  QuickAddTimerLoadingSkeleton,
  SettingsPageLoading,
  SharedTimerPageLoading,
  TimerCardLoadingSkeleton,
} from "@/components/app-shell-loading"

function skeletonCount(container: HTMLElement) {
  return container.querySelectorAll('[data-slot="skeleton"]').length
}

function loadingRegion(container: HTMLElement, region: string) {
  return container.querySelector(`[data-loading-region="${region}"]`)
}

function expectLoadingShell(container: HTMLElement, label: string) {
  const shell = container.querySelector(`[aria-live="polite"][aria-label="${label}"]`)
  expect(shell).toHaveAttribute("aria-busy", "true")
}

describe("app shell loading skeletons", () => {
  it("renders a neutral route loading fallback", () => {
    const { container } = render(<AppShellLoading />)

    expectLoadingShell(container, "Loading")
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument()
    expect(loadingRegion(container, "generic-main")).toBeInTheDocument()
    expect(loadingRegion(container, "timer-card")).not.toBeInTheDocument()
    expect(skeletonCount(container)).toBeGreaterThan(15)
  })

  it("renders a home-specific full page loader separately from the route fallback", () => {
    const { container } = render(<HomePageLoading />)

    expectLoadingShell(container, "Loading project")
    // The footer skeleton is scoped inside a section so the page-level site
    // footer in app/page.tsx stays the only contentinfo landmark.
    expect(container.querySelector("section > footer")).toBeInTheDocument()
    expect(container.querySelector("footer")?.closest("section")).not.toBeNull()
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByText("Countdown Timer to Any Date")).not.toBeInTheDocument()
    expect(screen.queryByText(/Create a Countdown Timer that counts down/)).not.toBeInTheDocument()
    expect(loadingRegion(container, "home-intro")).not.toBeInTheDocument()
    expect(loadingRegion(container, "quick-add")).toBeInTheDocument()
    expect(loadingRegion(container, "organizer")).toBeInTheDocument()
    expect(container.querySelectorAll('[data-loading-region="timer-card"]')).toHaveLength(3)
    expect(skeletonCount(container)).toBeGreaterThan(25)
  })

  it("renders a settings-specific loading layout", () => {
    const { container } = render(<SettingsPageLoading />)

    expectLoadingShell(container, "Loading settings")
    expect(container.querySelector("section > footer")).toBeInTheDocument()
    expect(container.querySelector("footer")?.closest("section")).not.toBeNull()
    expect(loadingRegion(container, "settings-main")).toBeInTheDocument()
    expect(loadingRegion(container, "settings-profile")).toBeInTheDocument()
    expect(loadingRegion(container, "settings-defaults")).toBeInTheDocument()
    expect(loadingRegion(container, "settings-alerts")).toBeInTheDocument()
    expect(loadingRegion(container, "settings-api-keys")).toBeInTheDocument()
    expect(loadingRegion(container, "quick-add")).not.toBeInTheDocument()
    expect(loadingRegion(container, "organizer")).not.toBeInTheDocument()
    expect(loadingRegion(container, "timer-card")).not.toBeInTheDocument()
    expect(skeletonCount(container)).toBeGreaterThan(20)
  })

  it("renders an auth-specific loading layout", () => {
    const { container } = render(<AuthPageLoading />)

    expectLoadingShell(container, "Loading sign-in")
    expect(container.querySelector("section > footer")).toBeInTheDocument()
    expect(container.querySelector("footer")?.closest("section")).not.toBeNull()
    expect(loadingRegion(container, "auth-main")).toBeInTheDocument()
    expect(loadingRegion(container, "generic-main")).not.toBeInTheDocument()
    expect(loadingRegion(container, "settings-main")).not.toBeInTheDocument()
    expect(loadingRegion(container, "quick-add")).not.toBeInTheDocument()
    expect(loadingRegion(container, "organizer")).not.toBeInTheDocument()
    expect(loadingRegion(container, "timer-card")).not.toBeInTheDocument()
    expect(skeletonCount(container)).toBeGreaterThan(7)
  })

  it("renders a shared timer loading layout", () => {
    const { container } = render(<SharedTimerPageLoading />)

    expectLoadingShell(container, "Loading shared timer")
    expect(container.querySelector("section > footer")).toBeInTheDocument()
    expect(container.querySelector("footer")?.closest("section")).not.toBeNull()
    expect(loadingRegion(container, "shared-timer-main")).toBeInTheDocument()
    expect(loadingRegion(container, "auth-main")).not.toBeInTheDocument()
    expect(loadingRegion(container, "settings-main")).not.toBeInTheDocument()
    expect(loadingRegion(container, "quick-add")).not.toBeInTheDocument()
    expect(loadingRegion(container, "organizer")).not.toBeInTheDocument()
    expect(loadingRegion(container, "timer-card")).not.toBeInTheDocument()
    expect(skeletonCount(container)).toBeGreaterThan(12)
  })

  it("keeps the main loading content reusable without duplicating the status in the shell", () => {
    const { container } = render(
      <div>
        <AppHeaderLoadingSkeleton />
        <main>
          <HomeMainLoadingSkeleton announce={false} />
        </main>
      </div>,
    )

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(skeletonCount(container)).toBeGreaterThan(20)
  })

  it("exposes focused skeleton building blocks for Storybook and client hydration", () => {
    const { container } = render(
      <div>
        <QuickAddTimerLoadingSkeleton />
        <OrganizerBarLoadingSkeleton />
        <TimerCardLoadingSkeleton pinned withImage />
      </div>,
    )

    expect(skeletonCount(container)).toBeGreaterThanOrEqual(20)
  })
})
