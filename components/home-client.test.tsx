import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HomeClient } from "@/components/home-client"
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
  HomeMainLoadingSkeleton: (props: { includeSeoIntro?: boolean }) => (
    <>
      {props.includeSeoIntro === false ? null : (
        <section aria-labelledby="home-seo-title">
          <h1 id="home-seo-title">Countdown Timer to Any Date</h1>
          <p>Create a Countdown Timer that counts down to your next deadline, launch, trip, or personal milestone.</p>
        </section>
      )}
      <div data-testid="home-loading" />
    </>
  ),
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer />,
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
  ProjectClaimSlot: () => <button type="button">Claim project</button>,
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
  return render(<HomeClient releaseTag="v0.0.0-test" />)
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
      timerFilters: { notifications: false, shared: false },
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

    renderHomeClient()

    expect(screen.getByTestId("home-loading")).toBeInTheDocument()
  })

  it("shows the onboarding banner when the user has a timer", () => {
    storeState.timers = [makeTimer()]

    renderHomeClient()

    expect(screen.getByText("Keep timers across devices")).toBeVisible()
  })

  it("renders mobile timer lists full-bleed inside the padded page shell", () => {
    storeState.timers = [makeTimer()]

    const { container } = renderHomeClient()

    expect(container.querySelector('[data-slot="timer-list"]')).toHaveClass("-mx-4", "md:mx-0")
  })

  it("shows the onboarding banner when the user has a space", () => {
    storeState.spaces = [makeSpace()]

    renderHomeClient()

    expect(screen.getByText("Keep timers across devices")).toBeVisible()
  })
})
