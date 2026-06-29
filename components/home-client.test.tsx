import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HomeClient } from "@/components/home-client"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TimerStore } from "@/lib/store"
import { makeSpace, makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  arrayMove: (items: string[], fromIndex: number, toIndex: number) => {
    const next = [...items]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    return next
  },
  verticalListSortingStrategy: {},
}))

vi.mock("@/components/app-shell-loading", () => ({
  HOME_EMPTY_TIMER_EXAMPLES: ["home.empty.example.trip", "home.empty.example.deadline", "home.empty.example.birthday"],
  HomeMainLoadingSkeleton: () => (
    <>
      <div data-loading-region="quick-add" />
      <div data-testid="home-loading" />
    </>
  ),
}))

vi.mock("@/components/header", () => ({
  Header: () => <header />,
}))

vi.mock("@/components/ios-pwa-prompt", () => ({
  IosPwaPrompt: () => null,
}))

vi.mock("@/components/organizer-bar", () => ({
  OrganizerBar: () => <div data-testid="organizer-bar" />,
}))

vi.mock("@/components/project-claim-slot", () => ({
  ProjectClaimToast: () => null,
}))

vi.mock("@/components/quick-add-timer", () => ({
  QuickAddTimer: () => <form aria-label="Quick add" />,
}))

vi.mock("@/components/timer-alarm-overlay", () => ({
  TimerAlarmOverlay: () => null,
}))

vi.mock("@/components/timer-card", () => ({
  TimerCard: () => <article>Timer card</article>,
}))

vi.mock("@/components/use-local-timer-alarms", () => ({
  useLocalTimerAlarms: () => ({
    alarm: null,
    dismissAlarm: vi.fn(),
  }),
}))

vi.mock("@/components/use-now", () => ({
  useNow: () => Date.parse("2026-05-24T00:00:00.000Z"),
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
  },
}))

vi.mock("@/lib/local-notification-preferences.client", () => ({
  useLocalNotificationPreferences: () => ({
    browserNotificationsEnabled: true,
    localAlarmEnabled: false,
  }),
}))

vi.mock("@/lib/project-claim-dismissal.client", () => ({
  dismissProjectClaim: vi.fn(),
  isProjectClaimDismissed: () => false,
  subscribeProjectClaimDismissed: () => () => {},
}))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

vi.mock("sonner", () => ({
  toast: vi.fn(),
}))

function renderHomeClient() {
  return render(
    <TooltipProvider delayDuration={0}>
      <HomeClient />
    </TooltipProvider>,
  )
}

describe("HomeClient", () => {
  beforeEach(() => {
    storeState = {
      activeProjectId: null,
      activeSpaceId: null,
      hasHydrated: true,
      hydrateProjectsFromBrowser: vi.fn(),
      overwriteCloudProjectVersion: vi.fn().mockResolvedValue(undefined),
      projectConflict: null,
      projects: [],
      refreshAccountProjectsFromCloud: vi.fn().mockResolvedValue(undefined),
      refreshActiveProjectFromCloud: vi.fn().mockResolvedValue(undefined),
      refreshFollowedTimers: vi.fn().mockResolvedValue(undefined),
      removeAccountProjectsFromDevice: vi.fn(),
      reorderVisibleTimers: vi.fn(),
      restoreKey: null,
      sortMode: "manual",
      spaces: [],
      isSyncing: false,
      lastSyncAt: null,
      lastSyncError: null,
      timerFilters: { type: "all", pinned: false, muted: false, shared: false, recurring: false },
      timers: [],
      useCloudProjectVersion: vi.fn(),
    }
  })

  it("hides the onboarding banner until the user has a timer or space", () => {
    renderHomeClient()

    expect(screen.queryByText("Keep timers across devices")).not.toBeInTheDocument()
  })

  it("renders the home loading scaffold before browser hydration", () => {
    storeState.hasHydrated = false

    const { container } = renderHomeClient()

    expect(screen.getByTestId("home-loading")).toBeInTheDocument()
    // The server-rendered HomeContentSection owns the real h1 below the client
    // shell; the hydration loader starts where the hydrated HomeClient starts.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByText("Countdown timer to any date")).not.toBeInTheDocument()
    expect(container.querySelector('[data-loading-region="home-intro"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-loading-region="quick-add"]')).toBeInTheDocument()
  })

  it("keeps the app footer sticky and scoped inside the timer list section", () => {
    const { container } = renderHomeClient()

    const section = container.querySelector('[data-slot="timer-list-section"]')
    const footer = section?.querySelector("footer")
    expect(footer).toHaveClass("sticky", "bottom-0", "z-30")
    expect(screen.getByText("Stored on this device")).toBeVisible()
    expect(screen.queryByText("Cloud data stays until you delete it.")).not.toBeInTheDocument()
    expect(screen.queryByText(/^v\d+\.\d+\.\d+/)).not.toBeInTheDocument()
    expect(screen.queryByText("tickward")).not.toBeInTheDocument()
    expect(screen.queryByText(/^© \d{4}$/)).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Docs" })).not.toBeInTheDocument()
  })

  it("shows the onboarding banner when the user has a timer", () => {
    storeState.timers = [makeTimer()]

    renderHomeClient()

    expect(screen.getByText("Keep timers across devices")).toBeVisible()
  })

  it("renders active timers inside the upcoming card group", () => {
    storeState.timers = [makeTimer()]

    const { container } = renderHomeClient()

    expect(screen.getByText("Upcoming")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="timer-list"]')).not.toHaveClass("-mx-4", "md:mx-0")
  })

  it("shows the onboarding banner when the user has a space", () => {
    storeState.spaces = [makeSpace()]

    renderHomeClient()

    expect(screen.getByText("Keep timers across devices")).toBeVisible()
  })
})
