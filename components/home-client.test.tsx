import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HomeClient } from "@/components/home-client"
import { COUNT_UP_VIEW_EVENT } from "@/components/count-up-navigation"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TimerStore } from "@/lib/store"
import type { CountUpOccurrence } from "@/lib/stores/count-up-store"
import { makeSpace, makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>
let sessionState: { data: { user: { id: string } } | null; isPending: boolean }
let currentNowMs: number
let localAlarmState: {
  alarm: {
    countUpOccurrence: boolean
    projectId: string
    timerId: string
    label: string
    boundary: string
    fullPageAlarm: boolean
  } | null
  dismissAlarm: ReturnType<typeof vi.fn>
}
const analyticsTrack = vi.hoisted(() => vi.fn())

vi.mock("@/components/plausible-analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/plausible-analytics")>()
  return { ...original, trackCountUpAnalyticsEvent: analyticsTrack }
})

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
  TimerAlarmOverlay: ({ alarm, onDismiss, onView }: { alarm: unknown; onDismiss: () => void; onView?: () => void }) =>
    alarm ? (
      <div>
        <button type="button" onClick={onDismiss}>
          Dismiss test alarm
        </button>
        {onView ? (
          <button type="button" onClick={onView}>
            View test alarm
          </button>
        ) : null}
      </div>
    ) : null,
}))

vi.mock("@/components/timer-card", () => ({
  TimerCard: ({
    timer,
    countUpOccurrence,
    countUpPlacement,
    countUpHolding,
    countUpCrossfade,
    onCountUpInteractionChange,
  }: {
    timer: { id: string; label: string }
    countUpOccurrence?: CountUpOccurrence
    countUpPlacement?: "section" | "pinned"
    countUpHolding?: boolean
    countUpCrossfade?: boolean
    onCountUpInteractionChange?: (active: boolean) => void
  }) => (
    <article
      data-count-up-project-id={countUpOccurrence?.projectId ?? storeState.activeProjectId ?? undefined}
      data-count-up-timer-id={timer.id}
      data-count-up-target-at-ms={countUpOccurrence?.targetAtMs}
      data-count-up-key={countUpOccurrence?.key}
      data-count-up-placement={countUpPlacement}
      data-count-up-holding={countUpHolding || undefined}
      data-count-up-crossfade={countUpCrossfade || undefined}
    >
      {timer.label}
      <button
        type="button"
        aria-label={`Focus ${timer.label}`}
        onFocus={() => onCountUpInteractionChange?.(true)}
        onBlur={() => onCountUpInteractionChange?.(false)}
      />
      <button
        type="button"
        aria-label={`Open menu ${timer.label}`}
        onClick={() => onCountUpInteractionChange?.(true)}
      />
      <button
        type="button"
        aria-label={`Close menu ${timer.label}`}
        onClick={() => onCountUpInteractionChange?.(false)}
      />
    </article>
  ),
}))

vi.mock("@/components/use-local-timer-alarms", () => ({
  useLocalTimerAlarms: () => localAlarmState,
}))

vi.mock("@/components/use-now", () => ({
  useNow: () => currentNowMs,
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

function countUpSection() {
  const section = document.getElementById("count-up-timers")
  expect(section).not.toBeNull()
  return section as HTMLElement
}

function countUpOccurrence(
  timerId: string,
  targetAtMs: number,
  overrides: Partial<CountUpOccurrence> = {},
): CountUpOccurrence {
  return {
    key: `${timerId}|${targetAtMs}`,
    projectId: "project-a",
    timerId,
    targetAtMs,
    crossedAt: targetAtMs,
    firstSeenAt: null,
    reviewExpiresAt: null,
    acknowledgedAt: null,
    deferredUntil: null,
    policy: { mode: "until-i-move-it", minutes: null },
    usesDefaultPolicy: true,
    ...overrides,
  }
}

describe("HomeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date("2026-05-24T00:00:00.000Z"))
    currentNowMs = Date.parse("2026-05-24T00:00:00.000Z")
    localAlarmState = { alarm: null, dismissAlarm: vi.fn() }

    sessionState = { data: null, isPending: false }
    storeState = {
      activeProjectId: null,
      acknowledgeCountUps: vi.fn(),
      countUpOccurrences: [],
      activeSpaceId: null,
      setActiveSpace: vi.fn(),
      clearTimerFilters: vi.fn(),
      hasHydrated: true,
      markCountUpSeen: vi.fn(),
      markCountUpSeenForProject: vi.fn(),
      openCountUpProject: vi.fn(),
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
      timerFilters: {
        type: "all",
        pinned: false,
        muted: false,
        shared: false,
        recurring: false,
      },
      timers: [],
      detectTimerZeroCross: vi.fn().mockReturnValue(true),
      syncCountUpOccurrences: vi.fn().mockResolvedValue(undefined),
      setPinnedTimer: vi.fn(),
      unacknowledgeCountUps: vi.fn(),
      useCloudProjectVersion: vi.fn(),
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("hides the onboarding banner until the user has a timer or space", () => {
    renderHomeClient()

    expect(screen.queryByText("Keep timers across devices")).not.toBeInTheDocument()
  })

  it("marks only the dismissed alarm occurrence as seen", () => {
    const targetDate = "2026-05-24T00:00:00.000Z"
    localAlarmState = {
      alarm: {
        countUpOccurrence: true,
        projectId: "project-a",
        timerId: "timer-alarm",
        label: "Deploy",
        boundary: targetDate,
        fullPageAlarm: true,
      },
      dismissAlarm: vi.fn(),
    }

    renderHomeClient()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss test alarm" }))

    expect(storeState.markCountUpSeenForProject).toHaveBeenCalledWith("project-a", [
      `timer-alarm|${Date.parse(targetDate)}`,
    ])
    expect(storeState.markCountUpSeen).not.toHaveBeenCalled()
    expect(storeState.acknowledgeCountUps).not.toHaveBeenCalled()
    expect(localAlarmState.dismissAlarm).toHaveBeenCalledTimes(1)
  })

  it("does not create attention state when dismissing a recurring alarm", () => {
    localAlarmState = {
      alarm: {
        countUpOccurrence: false,
        projectId: "project-a",
        timerId: "timer-recurring",
        label: "Standup",
        boundary: "2026-05-24T00:00:00.000Z",
        fullPageAlarm: true,
      },
      dismissAlarm: vi.fn(),
    }

    renderHomeClient()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss test alarm" }))

    expect(storeState.markCountUpSeenForProject).not.toHaveBeenCalled()
    expect(localAlarmState.dismissAlarm).toHaveBeenCalledTimes(1)
  })

  it("marks an alarm occurrence shown and routes View to its exact project timer", async () => {
    const targetDate = "2026-05-24T00:00:00.000Z"
    localAlarmState = {
      alarm: {
        countUpOccurrence: true,
        projectId: "project-b",
        timerId: "timer-alarm",
        label: "Deploy",
        boundary: targetDate,
        fullPageAlarm: true,
      },
      dismissAlarm: vi.fn(),
    }
    const dispatchEvent = vi.spyOn(globalThis, "dispatchEvent")

    renderHomeClient()
    fireEvent.click(screen.getByRole("button", { name: "View test alarm" }))
    await act(async () => Promise.resolve())

    expect(storeState.markCountUpSeenForProject).toHaveBeenCalledWith("project-b", [
      `timer-alarm|${Date.parse(targetDate)}`,
    ])
    expect(localAlarmState.dismissAlarm).toHaveBeenCalledTimes(1)
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: COUNT_UP_VIEW_EVENT,
        detail: {
          projectId: "project-b",
          timerId: "timer-alarm",
          targetAtMs: Date.parse(targetDate),
        },
      }),
    )
    expect(storeState.acknowledgeCountUps).not.toHaveBeenCalled()
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
    const pastSection = sectionForHeading("Counting up")
    expect(within(upcomingSection).getByText("Future launch")).toBeVisible()
    expect(within(upcomingSection).queryByText("Finished launch")).not.toBeInTheDocument()
    expect(within(pastSection).getByText("Finished launch")).toBeVisible()
    expect(pastSection.querySelector('[data-slot="timer-section-count"]')).toHaveTextContent("1")
  })

  it("shows active attention before regular count-ups in the count-up filter without duplicate cards", () => {
    const countUpTarget = Date.parse("2026-05-23T12:00:00.000Z")
    const acknowledgedTarget = Date.parse("2026-05-22T12:00:00.000Z")
    storeState.timerFilters = {
      type: "countUp",
      pinned: false,
      muted: false,
      shared: false,
      recurring: false,
    }
    storeState.timers = [
      makeTimer({
        id: "needs-review",
        label: "Needs review",
        targetDate: new Date(countUpTarget).toISOString(),
      }),
      makeTimer({
        id: "direct-past",
        label: "Direct Past",
        targetDate: "2026-05-21T12:00:00.000Z",
      }),
      makeTimer({
        id: "acknowledged",
        label: "Acknowledged Past",
        targetDate: new Date(acknowledgedTarget).toISOString(),
      }),
      makeTimer({
        id: "future",
        label: "Future countdown",
        targetDate: "2026-05-25T12:00:00.000Z",
      }),
    ]
    storeState.countUpOccurrences = [
      countUpOccurrence("needs-review", countUpTarget),
      countUpOccurrence("acknowledged", acknowledgedTarget, { acknowledgedAt: acknowledgedTarget + 1_000 }),
    ]

    renderHomeClient()

    const attention = countUpSection()
    const past = sectionForHeading("Counting up")
    expect(attention.compareDocumentPosition(past) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(attention).getByText("Needs review")).toBeVisible()
    expect(within(past).getByText("Direct Past")).toBeVisible()
    expect(within(past).getByText("Acknowledged Past")).toBeVisible()
    expect(screen.queryByText("Future countdown")).not.toBeInTheDocument()
    expect(past.querySelector('[data-slot="timer-section-count"]')).toHaveTextContent("2")
    expect(within(past).getAllByRole("article")).toHaveLength(2)
    for (const label of ["Needs review", "Direct Past", "Acknowledged Past"]) {
      expect(screen.getAllByText(label)).toHaveLength(1)
    }
  })

  it("keeps a pinned attention count-up in Pinned when count-up and pinned filters are combined", () => {
    const pinnedTarget = Date.parse("2026-05-23T12:00:00.000Z")
    const unpinnedTarget = Date.parse("2026-05-23T13:00:00.000Z")
    storeState.timerFilters = {
      type: "countUp",
      pinned: true,
      muted: false,
      shared: false,
      recurring: false,
    }
    storeState.timers = [
      makeTimer({
        id: "pinned-attention",
        label: "Pinned attention",
        pinned: true,
        targetDate: new Date(pinnedTarget).toISOString(),
      }),
      makeTimer({
        id: "unpinned-attention",
        label: "Unpinned attention",
        targetDate: new Date(unpinnedTarget).toISOString(),
      }),
    ]
    storeState.countUpOccurrences = [
      countUpOccurrence("pinned-attention", pinnedTarget),
      countUpOccurrence("unpinned-attention", unpinnedTarget),
    ]

    renderHomeClient()

    const pinned = sectionForHeading("Pinned")
    expect(within(pinned).getByText("Pinned attention").closest("article")).toHaveAttribute(
      "data-count-up-placement",
      "pinned",
    )
    expect(screen.getAllByText("Pinned attention")).toHaveLength(1)
    expect(screen.queryByText("Unpinned attention")).not.toBeInTheDocument()
    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument()
  })

  it("applies toggle filters equally to attention and acknowledged count-ups", () => {
    const sharedCountUpTarget = Date.parse("2026-05-23T12:00:00.000Z")
    const privateCountUpTarget = Date.parse("2026-05-23T11:00:00.000Z")
    const acknowledgedTarget = Date.parse("2026-05-22T12:00:00.000Z")
    storeState.timerFilters = {
      type: "countUp",
      pinned: false,
      muted: false,
      shared: true,
      recurring: false,
    }
    storeState.timers = [
      makeTimer({
        id: "shared-attention",
        label: "Shared attention",
        sharedAt: "2026-05-20T00:00:00.000Z",
        targetDate: new Date(sharedCountUpTarget).toISOString(),
      }),
      makeTimer({
        id: "private-attention",
        label: "Private attention",
        targetDate: new Date(privateCountUpTarget).toISOString(),
      }),
      makeTimer({
        id: "shared-acknowledged",
        label: "Shared acknowledged",
        sharedAt: "2026-05-20T00:00:00.000Z",
        targetDate: new Date(acknowledgedTarget).toISOString(),
      }),
    ]
    storeState.countUpOccurrences = [
      countUpOccurrence("shared-attention", sharedCountUpTarget),
      countUpOccurrence("private-attention", privateCountUpTarget),
      countUpOccurrence("shared-acknowledged", acknowledgedTarget, { acknowledgedAt: acknowledgedTarget + 1_000 }),
    ]

    renderHomeClient()

    expect(within(countUpSection()).getByText("Shared attention")).toBeVisible()
    expect(screen.queryByText("Private attention")).not.toBeInTheDocument()
    const past = sectionForHeading("Counting up")
    expect(within(past).getByText("Shared acknowledged")).toBeVisible()
    expect(past.querySelector('[data-slot="timer-section-count"]')).toHaveTextContent("1")
    expect(screen.getAllByText("Shared attention")).toHaveLength(1)
    expect(screen.getAllByText("Shared acknowledged")).toHaveLength(1)
  })

  it("hides attention count-ups from the countdown filter", () => {
    const countUpTarget = Date.parse("2026-05-23T12:00:00.000Z")
    storeState.timerFilters = {
      type: "countdown",
      pinned: false,
      muted: false,
      shared: false,
      recurring: false,
    }
    storeState.timers = [
      makeTimer({
        id: "attention-count-up",
        label: "Attention count-up",
        targetDate: new Date(countUpTarget).toISOString(),
      }),
      makeTimer({
        id: "future-countdown",
        label: "Future countdown",
        targetDate: "2026-05-25T12:00:00.000Z",
      }),
    ]
    storeState.countUpOccurrences = [countUpOccurrence("attention-count-up", countUpTarget)]

    renderHomeClient()

    expect(within(sectionForHeading("Upcoming")).getByText("Future countdown")).toBeVisible()
    expect(screen.queryByText("Attention count-up")).not.toBeInTheDocument()
    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument()
  })

  it("renders active attention timers once between Pinned and Upcoming", () => {
    const pinnedTarget = Date.parse("2026-05-23T10:00:00.000Z")
    const countUpTarget = Date.parse("2026-05-23T11:00:00.000Z")
    storeState.timers = [
      makeTimer({
        id: "timer-pinned",
        label: "Pinned finish",
        targetDate: new Date(pinnedTarget).toISOString(),
        timezone: "UTC",
        pinned: true,
      }),
      makeTimer({
        id: "count-up",
        label: "Needs attention",
        targetDate: new Date(countUpTarget).toISOString(),
        timezone: "UTC",
      }),
      makeTimer({
        id: "timer-upcoming",
        label: "Future launch",
        targetDate: "2026-05-25T12:00:00.000Z",
        timezone: "UTC",
      }),
    ]
    storeState.countUpOccurrences = [
      countUpOccurrence("timer-pinned", pinnedTarget),
      countUpOccurrence("count-up", countUpTarget),
    ]

    renderHomeClient()

    const pinned = sectionForHeading("Pinned")
    const attention = countUpSection()
    const upcoming = sectionForHeading("Upcoming")
    expect(within(pinned).getByText("Pinned finish").closest("article")).toHaveAttribute(
      "data-count-up-placement",
      "pinned",
    )
    expect(within(attention).getByText("Needs attention")).toBeVisible()
    expect(
      within(attention).getByText("Count-up timers stay at the top after reaching zero until you acknowledge them."),
    ).toBeVisible()
    expect(screen.getAllByText("Needs attention")).toHaveLength(1)
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument()
    expect(pinned.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(attention.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("orders unseen events newest first, then seen events oldest first", () => {
    const targets = [
      Date.parse("2026-05-20T00:00:00.000Z"),
      Date.parse("2026-05-21T00:00:00.000Z"),
      Date.parse("2026-05-22T00:00:00.000Z"),
      Date.parse("2026-05-23T00:00:00.000Z"),
    ]
    storeState.timers = [
      makeTimer({
        id: "seen-old",
        label: "Seen old",
        targetDate: new Date(targets[0]).toISOString(),
      }),
      makeTimer({
        id: "seen-new",
        label: "Seen new",
        targetDate: new Date(targets[1]).toISOString(),
      }),
      makeTimer({
        id: "unseen-old",
        label: "Unseen old",
        targetDate: new Date(targets[2]).toISOString(),
      }),
      makeTimer({
        id: "unseen-new",
        label: "Unseen new",
        targetDate: new Date(targets[3]).toISOString(),
      }),
    ]
    storeState.countUpOccurrences = [
      countUpOccurrence("seen-old", targets[0], {
        firstSeenAt: targets[0] + 1_000,
      }),
      countUpOccurrence("seen-new", targets[1], {
        firstSeenAt: targets[1] + 1_000,
      }),
      countUpOccurrence("unseen-old", targets[2]),
      countUpOccurrence("unseen-new", targets[3]),
    ]

    renderHomeClient()

    expect(
      within(countUpSection())
        .getAllByRole("article")
        .map((article) => article.textContent),
    ).toEqual(["Unseen new", "Unseen old", "Seen old"])
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }))
    expect(
      within(countUpSection())
        .getAllByRole("article")
        .map((article) => article.textContent),
    ).toEqual(["Unseen new", "Unseen old", "Seen old", "Seen new"])
    expect(storeState.markCountUpSeen).not.toHaveBeenCalled()
    expect(storeState.acknowledgeCountUps).not.toHaveBeenCalled()
  })

  it("keeps more than ten attention events capped at three cards with an aggregate summary", () => {
    storeState.timers = Array.from({ length: 12 }, (_, index) =>
      makeTimer({
        id: `attention-${index}`,
        label: `Attention ${index}`,
        targetDate: new Date(Date.parse("2026-05-23T00:00:00.000Z") + index * 1_000).toISOString(),
      }),
    ).concat(
      makeTimer({
        id: "upcoming",
        label: "Still upcoming",
        targetDate: "2026-05-25T00:00:00.000Z",
      }),
    )
    storeState.countUpOccurrences = storeState.timers
      .slice(0, 12)
      .map((timer) => countUpOccurrence(timer.id, Date.parse(timer.targetDate)))

    renderHomeClient()

    expect(within(countUpSection()).getAllByRole("article")).toHaveLength(3)
    expect(within(countUpSection()).getByText("9 more timers started counting up.")).toBeVisible()
    expect(within(sectionForHeading("Upcoming")).getByText("Still upcoming")).toBeVisible()
    expect(screen.queryByRole("button", { name: /Show 9 more/ })).not.toBeInTheDocument()
  })

  it("acknowledges all attention timers into Counting up with Undo", async () => {
    const firstTarget = Date.parse("2026-05-23T10:00:00.000Z")
    const secondTarget = Date.parse("2026-05-23T11:00:00.000Z")
    storeState.timers = [
      makeTimer({
        id: "first",
        label: "First",
        targetDate: new Date(firstTarget).toISOString(),
      }),
      makeTimer({
        id: "second",
        label: "Second",
        targetDate: new Date(secondTarget).toISOString(),
      }),
    ]
    const events = [countUpOccurrence("first", firstTarget), countUpOccurrence("second", secondTarget)]
    storeState.countUpOccurrences = events

    renderHomeClient()
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge all" }))

    const expectedKeys = events.map((event) => event.key)
    expect(storeState.acknowledgeCountUps).toHaveBeenCalledWith(expect.arrayContaining(expectedKeys))
    expect(analyticsTrack).toHaveBeenCalledWith("transition_bulk_action", {
      policy: "until-i-move-it",
      sectionSize: 0,
    })
    const { toast } = await import("sonner")
    const [, options] = vi.mocked(toast).mock.calls.at(-1)! as unknown as [string, { action: { onClick: () => void } }]
    act(() => options.action.onClick())
    expect(storeState.unacknowledgeCountUps).toHaveBeenCalledWith(expect.arrayContaining(expectedKeys))
    expect(analyticsTrack).toHaveBeenCalledWith("transition_undo", {
      policy: "until-i-move-it",
      sectionSize: 2,
    })
  })

  it("renders acknowledged events in their natural Past position", () => {
    const target = Date.parse("2026-05-23T10:00:00.000Z")
    storeState.timers = [
      makeTimer({
        id: "done",
        label: "Reviewed",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    storeState.countUpOccurrences = [countUpOccurrence("done", target, { acknowledgedAt: target + 2_000 })]

    renderHomeClient()

    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()
    expect(within(sectionForHeading("Counting up")).getByText("Reviewed")).toBeVisible()
  })

  it("does not attach another project's colliding occurrence to the active project", () => {
    const target = Date.parse("2026-05-23T10:00:00.000Z")
    storeState.activeProjectId = "project-a"
    storeState.projects = [{ id: "project-a", name: "Marketing" }] as TimerStore["projects"]
    storeState.timers = [
      makeTimer({
        id: "shared-id",
        label: "Marketing launch",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    storeState.countUpOccurrences = [countUpOccurrence("shared-id", target, { projectId: "project-b" })]

    renderHomeClient()

    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()
    expect(within(sectionForHeading("Counting up")).getByText("Marketing launch")).toBeVisible()
  })

  it("moves an unacknowledged unpinned count-up to attention and an acknowledged one to Counting up", () => {
    const target = Date.parse("2026-05-23T10:00:00.000Z")
    const timer = makeTimer({
      id: "pinned-count-up",
      label: "Pinned launch",
      pinned: true,
      targetDate: new Date(target).toISOString(),
    })
    const event = countUpOccurrence(timer.id, target)
    storeState.timers = [timer]
    storeState.countUpOccurrences = [event]
    const view = renderHomeClient()

    expect(within(sectionForHeading("Pinned")).getByText("Pinned launch")).toBeVisible()
    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()

    storeState.timers = [{ ...timer, pinned: false }]
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )
    expect(within(countUpSection()).getByText("Pinned launch")).toBeVisible()

    storeState.countUpOccurrences = [{ ...event, acknowledgedAt: target + 1_000 }]
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )
    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()
    expect(within(sectionForHeading("Counting up")).getByText("Pinned launch")).toBeVisible()
  })

  it("announces a mounted zero cross once, holds its card, then moves it without scrolling", () => {
    const target = currentNowMs
    storeState.timers = [
      makeTimer({
        id: "boundary-cross",
        label: "Boundary launch",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    vi.mocked(storeState.detectTimerZeroCross!).mockImplementation((timerId) => {
      storeState.countUpOccurrences = [countUpOccurrence(timerId, target)]
      return true
    })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const view = renderHomeClient()

    currentNowMs = target + 1
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )

    expect(storeState.detectTimerZeroCross).toHaveBeenCalledWith("boundary-cross", target + 1)
    expect(screen.getByText("Boundary launch started counting up")).toBeInTheDocument()
    expect(within(sectionForHeading("Upcoming")).getByText("Boundary launch").closest("article")).toHaveAttribute(
      "data-count-up-holding",
      "true",
    )

    act(() => vi.advanceTimersByTime(1_500))
    expect(within(countUpSection()).getByText("Boundary launch")).toBeVisible()
    expect(scrollIntoView).not.toHaveBeenCalled()

    currentNowMs = target + 2_000
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )
    expect(storeState.detectTimerZeroCross).toHaveBeenCalledTimes(1)
  })

  it("keeps an offscreen active-project crossing visible in a sticky banner until View reveals it", async () => {
    const target = currentNowMs
    storeState.activeProjectId = "project-a"
    storeState.projects = [{ id: "project-a", name: "Marketing" }] as TimerStore["projects"]
    storeState.timers = [
      makeTimer({
        id: "offscreen-cross",
        label: "Campaign launch",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    vi.mocked(storeState.detectTimerZeroCross!).mockImplementation((timerId) => {
      storeState.countUpOccurrences = [countUpOccurrence(timerId, target, { projectId: "project-a" })]
      return true
    })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const view = renderHomeClient()
    vi.spyOn(screen.getByText("Campaign launch").closest("article")!, "getBoundingClientRect").mockReturnValue({
      top: 1_200,
      right: 300,
      bottom: 1_300,
      left: 100,
      width: 200,
      height: 100,
      x: 100,
      y: 1_200,
      toJSON: () => ({}),
    })

    currentNowMs = target + 1
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )

    const banner = document.querySelector<HTMLElement>("[data-slot='count-up-sticky-banner']")
    expect(banner).toBeVisible()
    await act(async () => {
      fireEvent.click(within(banner!).getByRole("button", { name: "View" }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" })
    expect(document.querySelector("[data-slot='count-up-sticky-banner']")).not.toBeInTheDocument()
    expect(storeState.markCountUpSeen).not.toHaveBeenCalled()
    expect(storeState.acknowledgeCountUps).not.toHaveBeenCalled()
  })

  it("detects a crossing outside the active space and View clears local narrowing", async () => {
    const target = currentNowMs
    storeState.activeProjectId = "project-a"
    storeState.projects = [{ id: "project-a", name: "Marketing" }] as TimerStore["projects"]
    storeState.activeSpaceId = "space-a"
    storeState.spaces = [makeSpace({ id: "space-a", name: "Current" }), makeSpace({ id: "space-b", name: "Other" })]
    storeState.timers = [
      makeTimer({
        id: "hidden-cross",
        label: "Hidden launch",
        spaceId: "space-b",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    vi.mocked(storeState.detectTimerZeroCross!).mockImplementation((timerId) => {
      storeState.countUpOccurrences = [countUpOccurrence(timerId, target, { projectId: "project-a" })]
      return true
    })
    const view = renderHomeClient()

    currentNowMs = target + 1
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )

    expect(storeState.detectTimerZeroCross).toHaveBeenCalledWith("hidden-cross", target + 1)
    expect(screen.queryByText("Hidden launch")).not.toBeInTheDocument()
    const banner = document.querySelector<HTMLElement>("[data-slot='count-up-sticky-banner']")
    expect(banner).toBeVisible()
    await act(async () => {
      fireEvent.click(within(banner!).getByRole("button", { name: "View" }))
      await Promise.resolve()
    })
    expect(storeState.setActiveSpace).toHaveBeenCalledWith(null)
    expect(storeState.clearTimerFilters).toHaveBeenCalledTimes(1)
    expect(storeState.markCountUpSeen).not.toHaveBeenCalled()
    expect(storeState.acknowledgeCountUps).not.toHaveBeenCalled()
  })

  it("opens and reveals an explicitly targeted attention occurrence", async () => {
    const target = Date.parse("2026-05-23T12:00:00.000Z")
    storeState.activeProjectId = "project-a"
    storeState.projects = [{ id: "project-a", name: "Marketing" }] as TimerStore["projects"]
    storeState.timers = [makeTimer({ id: "targeted", label: "Targeted", targetDate: new Date(target).toISOString() })]
    storeState.countUpOccurrences = [countUpOccurrence("targeted", target, { projectId: "project-a" })]
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderHomeClient()

    globalThis.dispatchEvent(
      new CustomEvent(COUNT_UP_VIEW_EVENT, {
        detail: { projectId: "project-a", timerId: "targeted", targetAtMs: target },
      }),
    )
    await act(async () => Promise.resolve())

    expect(storeState.openCountUpProject).toHaveBeenCalledWith("project-a")
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" })
    expect(storeState.markCountUpSeen).not.toHaveBeenCalled()
    expect(storeState.acknowledgeCountUps).not.toHaveBeenCalled()
  })

  it("moves directly to Counting up without attention choreography when detection is short-circuited", () => {
    const target = currentNowMs
    storeState.timers = [
      makeTimer({
        id: "direct-to-past",
        label: "Direct finish",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    vi.mocked(storeState.detectTimerZeroCross!).mockReturnValue(false)
    const view = renderHomeClient()

    currentNowMs = target + 1
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )

    expect(storeState.detectTimerZeroCross).toHaveBeenCalledWith("direct-to-past", target + 1)
    expect(screen.queryByText("Direct finish started counting up")).not.toBeInTheDocument()
    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()
    expect(within(sectionForHeading("Counting up")).getByText("Direct finish")).toBeVisible()
  })

  it("defers the physical move while keyboard focus or a menu interaction remains active", () => {
    const target = currentNowMs
    storeState.timers = [
      makeTimer({
        id: "focused",
        label: "Focused",
        targetDate: new Date(target).toISOString(),
      }),
      makeTimer({
        id: "menu",
        label: "Menu open",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    vi.mocked(storeState.detectTimerZeroCross!).mockImplementation((timerId) => {
      storeState.countUpOccurrences = [
        ...(storeState.countUpOccurrences ?? []),
        countUpOccurrence(timerId, target),
      ] as CountUpOccurrence[]
      return true
    })
    const view = renderHomeClient()
    const focusTarget = screen.getByRole("button", { name: "Focus Focused" })
    fireEvent.focus(focusTarget)
    fireEvent.click(screen.getByRole("button", { name: "Open menu Menu open" }))

    currentNowMs = target + 1
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )
    act(() => vi.advanceTimersByTime(1_500))
    expect(within(sectionForHeading("Upcoming")).getByText("Focused")).toBeVisible()
    expect(within(sectionForHeading("Upcoming")).getByText("Menu open")).toBeVisible()

    fireEvent.blur(screen.getByRole("button", { name: "Focus Focused" }))
    expect(within(countUpSection()).getByText("Focused")).toBeVisible()
    expect(within(sectionForHeading("Upcoming")).getByText("Menu open")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "Close menu Menu open" }))
    expect(within(countUpSection()).getByText("Menu open")).toBeVisible()
  })

  it("uses a crossfade and announces the destination when reduced motion is preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    )
    const target = currentNowMs
    storeState.timers = [
      makeTimer({
        id: "reduced",
        label: "Quiet move",
        targetDate: new Date(target).toISOString(),
      }),
    ]
    vi.mocked(storeState.detectTimerZeroCross!).mockImplementation((timerId) => {
      storeState.countUpOccurrences = [countUpOccurrence(timerId, target)]
      return true
    })
    const view = renderHomeClient()

    currentNowMs = target + 1
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <HomeClient />
      </TooltipProvider>,
    )
    act(() => vi.advanceTimersByTime(1_500))

    expect(within(countUpSection()).getByText("Quiet move").closest("article")).toHaveAttribute(
      "data-count-up-crossfade",
      "true",
    )
    expect(screen.getByText("Quiet move moved to Started counting up.")).toBeInTheDocument()
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
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument()
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
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument()
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

    const pastSection = sectionForHeading("Counting up")
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
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument()
  })

  it("keeps pinned elapsed timers under Pinned instead of Past", () => {
    const targetAtMs = Date.parse("2026-05-23T12:00:00.000Z")
    storeState.timers = [
      makeTimer({
        id: "timer-pinned-elapsed",
        label: "Pinned finish",
        targetDate: new Date(targetAtMs).toISOString(),
        timezone: "UTC",
        pinned: true,
      }),
    ]
    storeState.countUpOccurrences = [countUpOccurrence("timer-pinned-elapsed", targetAtMs)]

    renderHomeClient()

    const pinnedSection = sectionForHeading("Pinned")
    expect(within(pinnedSection).getByText("Pinned finish")).toBeVisible()
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument()
    expect(document.getElementById("count-up-timers")).not.toBeInTheDocument()
    expect(screen.queryByText(/Timers stay here after they reach zero/)).not.toBeInTheDocument()
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
    expect(storeState.syncCountUpOccurrences).toHaveBeenCalledTimes(1)
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
