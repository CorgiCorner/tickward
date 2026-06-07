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

describe("app shell loading skeletons", () => {
  it("renders a neutral route loading fallback", () => {
    const { container } = render(<AppShellLoading />)

    expect(screen.getByRole("status", { name: "Loading" })).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument()
    expect(loadingRegion(container, "generic-main")).toBeInTheDocument()
    expect(loadingRegion(container, "timer-card")).not.toBeInTheDocument()
    expect(skeletonCount(container)).toBeGreaterThan(15)
  })

  it("renders a home-specific full page loader separately from the route fallback", () => {
    const { container } = render(<HomePageLoading />)

    expect(screen.getByRole("status", { name: "Loading project" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Countdown Timer to Any Date" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Create a Countdown Timer that counts down/)).not.toBeInTheDocument()
    expect(loadingRegion(container, "quick-add")).toBeInTheDocument()
    expect(loadingRegion(container, "organizer")).toBeInTheDocument()
    expect(container.querySelectorAll('[data-loading-region="timer-card"]')).toHaveLength(3)
    expect(skeletonCount(container)).toBeGreaterThan(30)
  })

  it("renders a settings-specific loading layout", () => {
    const { container } = render(<SettingsPageLoading />)

    expect(screen.getByRole("status", { name: "Loading settings" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
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

    expect(screen.getByRole("status", { name: "Loading sign-in" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
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

    expect(screen.getByRole("status", { name: "Loading shared timer" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
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
