import { act, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HomeClient } from "@/components/home-client"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TimerStore } from "@/lib/store"
import { makeSpace, makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>
let sessionState: { data: { user: { id: string } } | null; isPending: boolean }

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
  TimerCard: ({ timer }: { timer: { label: string } }) => <article>{timer.label}</article>,
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
    useSession: () => sessionState,
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
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}))

function renderHomeClient() {
  return render(
    <TooltipProvider delayDuration={0}>
      <HomeClient />
    </TooltipProvider>,
  )
}

function sectionForHeading(name: string) {
  const section = screen.getByText(name).closest("section")
  expect(section).not.toBeNull()
  return section as HTMLElement
}

describe("HomeClient", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-05-24T00:00:00.000Z"))

    sessionState = { data: null, isPending: false }
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
      sortMode: "soonest",
      spaces: [],
      isSyncing: false,
      lastSyncAt: null,
      lastSyncError: null,
      timerFilters: { type: "all", pinned: false, muted: false, shared: false, recurring: false },
      timers: [],
      useCloudProjectVersion: vi.fn(),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
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
    expect(screen.queryByText("Projects on your account stay until you delete them.")).not.toBeInTheDocument()
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

  it("renders elapsed one-time timers under Past instead of Upcoming", () => {
    storeState.timers = [
      makeTimer({
        id: "timer-past",
        label: "Finished launch",
        targetDate: "2026-05-23T12:00:00.000Z",
        timezone: "UTC",
      }),
      makeTimer({
        id: "timer-future",
        label: "Future launch",
        targetDate: "2026-05-25T12:00:00.000Z",
        timezone: "UTC",
      }),
    ]

    renderHomeClient()

    const upcomingSection = sectionForHeading("Upcoming")
    const pastSection = sectionForHeading("Past")
    expect(within(upcomingSection).getByText("Future launch")).toBeVisible()
    expect(within(upcomingSection).queryByText("Finished launch")).not.toBeInTheDocument()
    expect(within(pastSection).getByText("Finished launch")).toBeVisible()
  })

  it("keeps recurring timers with elapsed anchors under Upcoming", () => {
    storeState.timers = [
      makeTimer({
        id: "timer-recurring",
        label: "Daily check",
        targetDate: "2026-05-23T12:00:00.000Z",
        timezone: "UTC",
        recurrence: { enabled: true, type: "daily" },
      }),
    ]

    renderHomeClient()

    const upcomingSection = sectionForHeading("Upcoming")
    expect(within(upcomingSection).getByText("Daily check")).toBeVisible()
    expect(screen.queryByText("Past")).not.toBeInTheDocument()
  })

  it("keeps archived elapsed timers under Archived", () => {
    storeState.timers = [
      makeTimer({
        id: "timer-archived",
        label: "Archived launch",
        targetDate: "2026-05-23T12:00:00.000Z",
        timezone: "UTC",
        archivedAt: "2026-05-23T13:00:00.000Z",
      }),
    ]

    renderHomeClient()

    const archivedSection = sectionForHeading("Archived")
    expect(within(archivedSection).getByText("Archived launch")).toBeVisible()
    expect(screen.queryByText("Past")).not.toBeInTheDocument()
  })

  it("sorts past timers by most recently elapsed first", () => {
    storeState.sortMode = "name_asc"
    storeState.timers = [
      makeTimer({
        id: "timer-older",
        label: "A older finish",
        targetDate: "2026-05-21T12:00:00.000Z",
        timezone: "UTC",
      }),
      makeTimer({
        id: "timer-recent",
        label: "Z recent finish",
        targetDate: "2026-05-23T12:00:00.000Z",
        timezone: "UTC",
      }),
    ]

    renderHomeClient()

    const pastSection = sectionForHeading("Past")
    expect(
      within(pastSection)
        .getAllByRole("article")
        .map((article) => article.textContent),
    ).toEqual(["Z recent finish", "A older finish"])
  })

  it("keeps a timer at its exact target instant under Upcoming", () => {
    storeState.timers = [
      makeTimer({
        id: "timer-boundary",
        label: "Boundary launch",
        targetDate: "2026-05-24T00:00:00.000Z",
        timezone: "UTC",
      }),
    ]

    renderHomeClient()

    const upcomingSection = sectionForHeading("Upcoming")
    expect(within(upcomingSection).getByText("Boundary launch")).toBeVisible()
    expect(screen.queryByText("Past")).not.toBeInTheDocument()
  })

  it("keeps pinned elapsed timers under Pinned instead of Past", () => {
    storeState.timers = [
      makeTimer({
        id: "timer-pinned-elapsed",
        label: "Pinned finish",
        targetDate: "2026-05-23T12:00:00.000Z",
        timezone: "UTC",
        pinned: true,
      }),
    ]

    renderHomeClient()

    const pinnedSection = sectionForHeading("Pinned")
    expect(within(pinnedSection).getByText("Pinned finish")).toBeVisible()
    expect(screen.queryByText("Past")).not.toBeInTheDocument()
  })

  it("shows the onboarding banner when the user has a space", () => {
    storeState.spaces = [makeSpace()]

    renderHomeClient()

    expect(screen.getByText("Keep timers across devices")).toBeVisible()
  })

  it("auto-claims the active project after refreshing account projects for a signed-in session", async () => {
    sessionState = { data: { user: { id: "user_123" } }, isPending: false }
    const maybeAutoClaimActiveProject = vi.fn().mockResolvedValue("claimed")
    Object.assign(storeState, { maybeAutoClaimActiveProject })

    renderHomeClient()
    await act(async () => {})

    expect(storeState.refreshAccountProjectsFromCloud).toHaveBeenCalledTimes(1)
    expect(maybeAutoClaimActiveProject).toHaveBeenCalledTimes(1)
    expect(storeState.removeAccountProjectsFromDevice).not.toHaveBeenCalled()
  })

  it("renders the read-only banner when the active project is over-limit", () => {
    storeState.isActiveProjectReadOnly = true
    storeState.timers = [makeTimer()]

    renderHomeClient()

    // This text comes from i18n key project.readOnly.banner.title
    expect(screen.getByText("This project is read-only.")).toBeInTheDocument()
  })

  it("does not render the read-only banner when the project is within the limit", () => {
    ;(storeState as Record<string, unknown>).isActiveProjectReadOnly = false
    storeState.timers = [makeTimer()]

    renderHomeClient()

    expect(screen.queryByText("This project is read-only.")).not.toBeInTheDocument()
  })

  it("shows the claimed_read_only toast when maybeAutoClaimActiveProject resolves to claimed_read_only", async () => {
    const { toast } = await import("sonner")
    sessionState = { data: { user: { id: "user_123" } }, isPending: false }
    const maybeAutoClaimActiveProject = vi.fn().mockResolvedValue("claimed_read_only")
    Object.assign(storeState, { maybeAutoClaimActiveProject })

    renderHomeClient()
    await act(async () => {})

    // The claimed_read_only status surfaces the auth.claim.claimedReadOnly message.
    expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.stringContaining("read-only"))
  })
})
