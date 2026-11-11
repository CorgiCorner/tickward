import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TimerCard } from "@/components/timer-card"
import { TIMER_FOCUS_THEME_STORAGE_KEY } from "@/components/timer-focus-mode"
import { LOCAL_NOTIFICATION_STORAGE_KEYS } from "@/lib/notification-preferences"
import type { TimerStore } from "@/lib/store"
import type { CountUpOccurrence } from "@/lib/stores/count-up-store"
import { makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>
const authMocks = vi.hoisted(() => ({
  useSession: vi.fn(),
}))
const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
)
const analyticsTrack = vi.hoisted(() => vi.fn())

const countUpOccurrence: CountUpOccurrence = {
  key: "timer-a|1779703200000",
  timerId: "timer-a",
  targetAtMs: Date.parse("2026-05-25T12:00:00.000Z"),
  crossedAt: Date.parse("2026-05-25T12:00:00.000Z"),
  firstSeenAt: null,
  reviewExpiresAt: null,
  acknowledgedAt: null,
  deferredUntil: null,
  policy: { mode: "until-i-move-it", minutes: null },
  usesDefaultPolicy: true,
}

// Counts mounted detail views; the real view still renders.
const detailDialogMounts = vi.hoisted(() => ({ current: 0 }))
vi.mock("@/components/timer-detail/timer-detail-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/timer-detail/timer-detail-dialog")>()
  const { useEffect } = await import("react")
  function CountedTimerDetailDialog(props: Parameters<typeof actual.TimerDetailDialog>[0]) {
    useEffect(() => {
      detailDialogMounts.current += 1
      return () => {
        detailDialogMounts.current -= 1
      }
    }, [])
    return <actual.TimerDetailDialog {...props} />
  }
  return { ...actual, TimerDetailDialog: CountedTimerDetailDialog }
})

vi.mock("@/components/plausible-analytics", () => ({
  trackCountUpAnalyticsEvent: analyticsTrack,
}))

vi.mock("@/components/use-now", () => ({ useNow: () => Date.now() }))
vi.mock("@/components/dashboard/use-minute-now", () => ({ useMinuteNow: () => Date.now() }))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: authMocks.useSession,
  },
}))

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("sonner", () => ({
  toast: toastMock,
}))

function setViewportMobile(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

async function openFirstTimerActions(user: ReturnType<typeof userEvent.setup>) {
  const menuButton = screen.getAllByRole("button", {
    name: "Open timer actions",
  })[0]
  await user.click(menuButton)
  return menuButton
}

async function clickFirstTimerAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openFirstTimerActions(user)
  await user.click(await screen.findByRole("menuitem", { name }))
}

describe("TimerCard", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    authMocks.useSession.mockReset()
    authMocks.useSession.mockReturnValue({
      data: { user: { id: "user_123", email: "ada@example.com" } },
    })
    localStorage.clear()
    document.body.style.overflow = ""
    Reflect.deleteProperty(globalThis, "Notification")
    setViewportMobile(false)
    toastMock.mockClear()
    toastMock.success.mockClear()
    toastMock.error.mockClear()
    analyticsTrack.mockReset()
    storeState = {
      restoreKey: "restoreKey_123",
      projects: [
        {
          id: "project-local",
          name: "Project",
          restoreKey: "restoreKey_123",
          cloudProjectId: "project_123",
          createdAt: "2026-05-20T00:00:00.000Z",
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      spaces: [],
      activeProjectId: "project-local",
      removeTimer: vi.fn(),
      addTimer: vi.fn().mockReturnValue(true),
      updateTimer: vi.fn(),
      archiveTimer: vi.fn(),
      unarchiveTimer: vi.fn(),
      duplicateTimer: vi.fn(),
      setPinnedTimer: vi.fn(),
      acknowledgeCountUps: vi.fn(),
      unacknowledgeCountUps: vi.fn(),
      deferCountUps: vi.fn(),
      unfollowTimer: vi.fn(),
      syncToCloud: vi.fn().mockResolvedValue(true),
    }
  })

  it("counts up from a since anchor while showing the next milestone", () => {
    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2024-01-01T10:00:00.000Z",
          mode: "since",
          milestones: { rules: [{ unit: "years", every: 1 }] },
          notify: false,
        })}
        nowMs={Date.parse("2026-06-01T00:00:00.000Z")}
      />,
    )

    expect(screen.getAllByText("Since")[0]).toBeVisible()
    expect(screen.getAllByText(/Next: 3 years/)[0]).toBeVisible()
  })

  it("keeps the date line visible and puts the description on its own line", () => {
    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2026-11-11T15:00:00.000Z",
          description: "Tickets are in the wallet.",
        })}
        nowMs={Date.parse("2026-11-10T12:00:00.000Z")}
      />,
    )

    const dates = document.querySelectorAll('[data-slot="timer-card-date"]')
    expect(dates.length).toBeGreaterThan(0)
    expect(dates[0]).toHaveTextContent("Nov 11, 2026 · 16:00 · Europe/Warsaw")
    expect(screen.getAllByText("Tickets are in the wallet.")[0]).toHaveAttribute("data-slot", "timer-card-description")
  })

  it("uses one set of unit labels and drops the day segment under a day", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-10T12:00:00.000Z"))
    render(<TimerCard timer={makeTimer({ targetDate: "2026-11-11T02:10:03.000Z" })} nowMs={Date.now()} />)

    const counter = document.querySelector('[data-slot="timer-card-counter"]')
    expect(counter).toHaveTextContent("14hrs:10min:03sec")
    expect(counter).not.toHaveTextContent(/day/)
  })

  it("always shows when a count-up started, even with a description", () => {
    render(
      <TimerCard
        timer={makeTimer({ targetDate: "2026-11-09T20:10:00.000Z", mode: "since", description: "Lamp collected." })}
        nowMs={Date.parse("2026-11-10T12:00:00.000Z")}
      />,
    )

    expect(document.querySelector('[data-slot="timer-card-date"]')).toHaveTextContent(
      "Since Nov 9, 2026 · 21:10 · Europe/Warsaw",
    )
  })

  it("shows the next reminder with a bell on a countdown", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-10T09:00:00.000Z"))
    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2026-11-11T15:00:00.000Z",
          notify: true,
          reminders: [{ offsetMinutes: 1440 }, { offsetMinutes: 10080 }],
        })}
        nowMs={Date.now()}
      />,
    )

    expect(document.querySelector('[data-slot="timer-card-next"]')).toHaveTextContent(
      "Reminder: 1 day before · today 16:00",
    )
  })

  it("never shows milestones on a countdown", () => {
    render(
      <TimerCard
        timer={makeTimer({ targetDate: "2026-11-11T15:00:00.000Z", notify: false })}
        nowMs={Date.parse("2026-11-10T12:00:00.000Z")}
      />,
    )

    expect(document.querySelector('[data-slot="timer-card-next"]')).toBeNull()
  })

  describe("milestone day", () => {
    const sinceWeMet = makeTimer({
      id: "since-we-met",
      label: "Since we met",
      mode: "since",
      color: "rgb(124, 58, 237)",
      targetDate: "2023-11-10T09:00:00.000Z",
      timezone: "Europe/Warsaw",
      milestones: { rules: [{ unit: "years", every: 1 }] },
      notify: false,
    })

    beforeEach(() => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-10T12:00:00.000Z"))
    })

    it("shows the badge without a value and the reached value in the corner", async () => {
      render(<TimerCard timer={sinceWeMet} nowMs={Date.now()} />)

      const badges = document.querySelectorAll('[data-slot="milestone-reached-badge"]')
      expect(badges.length).toBeGreaterThan(0)
      expect(badges[0]).toHaveTextContent(/^Milestone reached$/)
      expect(document.querySelector('[data-slot="timer-card-reached"]')).toHaveTextContent("3 years")
      expect(document.querySelector('[data-slot="timer-card-next"]')).toBeNull()
      expect(document.querySelector("article")).toHaveAttribute("data-milestone-day")
      // The moment plays once: the bar closes from just short of full.
      const bar = document.querySelector('[data-slot="milestone-progress"] > div') as HTMLElement
      await waitFor(() => expect(bar.style.transform).toBe("scaleX(1)"))
      expect(localStorage.getItem("tickward:milestone-moments")).toContain("card|since-we-met|years|3")
    })

    it("does not replay the moment on the same day unless the badge is clicked", async () => {
      localStorage.setItem("tickward:milestone-moments", JSON.stringify({ "card|since-we-met|years|3": Date.now() }))
      const user = userEvent.setup()
      render(<TimerCard timer={sinceWeMet} nowMs={Date.now()} />)

      const bar = document.querySelector('[data-slot="milestone-progress"] > div') as HTMLElement
      expect(bar.style.transform).toBe("scaleX(1)")
      await user.click(screen.getAllByRole("button", { name: /Replay the milestone moment/ })[0])
      await waitFor(() => expect(bar.style.transform).toBe("scaleX(1)"))
    })

    it("rolls the count, closes the bar and brings the badge in, keeping only fades with reduced motion", () => {
      // A timer whose moment has not played in this run yet.
      render(<TimerCard timer={{ ...sinceWeMet, id: "since-we-met-roll" }} nowMs={Date.now()} />)

      // Before the first frame the moment shows yesterday's count, ready to roll.
      const roll = document.querySelector('[data-slot="milestone-roll"]') as HTMLElement
      expect(roll).toHaveAttribute("data-phase", "before")
      const [today, yesterday] = Array.from(roll.children) as HTMLElement[]
      expect(today).toHaveTextContent("1,096")
      expect(yesterday).toHaveTextContent("1,095")
      expect(yesterday).toHaveAttribute("aria-hidden", "true")
      // The travel is multiplied by --motion-travel, which reduced motion sets to 0.
      expect(today.className).toContain("var(--motion-travel)")
      const bar = document.querySelector('[data-slot="milestone-progress"] > div') as HTMLElement
      expect(bar.className).toContain("transition-none")
      const badge = document.querySelector('[data-slot="milestone-reached-badge"]') as HTMLElement
      expect(badge).toHaveClass("motion-reduce:scale-100")
    })

    it("keeps the number in the text colour", () => {
      render(<TimerCard timer={sinceWeMet} nowMs={Date.now()} />)

      const counter = document.querySelector('[data-slot="timer-card-counter"]') as HTMLElement
      expect(counter).toHaveTextContent("1,096days")
      expect(counter.querySelector("[style]")).toBeNull()
    })

    it("leaves the corner empty when the counter already shows the value", () => {
      render(
        <TimerCard
          timer={{
            ...sinceWeMet,
            targetDate: "2023-04-20T09:00:00.000Z",
            milestones: { rules: [{ unit: "days", every: 100 }] },
          }}
          nowMs={Date.now()}
        />,
      )

      expect(document.querySelectorAll('[data-slot="milestone-reached-badge"]').length).toBeGreaterThan(0)
      expect(document.querySelector('[data-slot="timer-card-reached"]')).toBeNull()
    })

    it("switches the count format on click and keeps it on this device only", async () => {
      const user = userEvent.setup()
      render(<TimerCard timer={sinceWeMet} nowMs={Date.now()} />)

      // The label starts with the count, so a screen reader still hears the number.
      const toggle = screen.getAllByRole("button", { name: "1,096 days. Show years, months and days" })[0]
      await user.click(toggle)

      expect(localStorage.getItem("tickward:count-up-format:since-we-met")).toBe("calendar")
      expect(screen.getAllByRole("button", { name: "3 years. Show total days" })[0]).toHaveAttribute(
        "data-format",
        "calendar",
      )
      // An exact anniversary reads "3 years" in the counter, so the corner stays empty.
      expect(document.querySelector('[data-slot="timer-card-reached"]')).toBeNull()
      expect(storeState.updateTimer).not.toHaveBeenCalled()

      await user.click(screen.getAllByRole("button", { name: "3 years. Show total days" })[0])
      expect(localStorage.getItem("tickward:count-up-format:since-we-met")).toBeNull()
    })

    it("leaves the card moment unplayed when only the menu is rendered, as in the dial view", async () => {
      // A timer whose moment has not played in this run yet.
      const timer = { ...sinceWeMet, id: "since-we-met-dial" }
      const { unmount } = render(<TimerCard timer={timer} nowMs={Date.now()} variant="menu" />)
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
      })
      unmount()
      expect(localStorage.getItem("tickward:milestone-moments") ?? "").not.toContain("card|since-we-met-dial")

      // Back on the grid, the card still plays its moment.
      render(<TimerCard timer={timer} nowMs={Date.now()} />)
      await waitFor(() =>
        expect(localStorage.getItem("tickward:milestone-moments")).toContain("card|since-we-met-dial|years|3"),
      )
    })

    it("keeps the reached value on a compact card, whose counter reads total days in any format", () => {
      localStorage.setItem("tickward:count-up-format:since-we-met", "calendar")
      render(<TimerCard timer={sinceWeMet} nowMs={Date.now()} compact />)

      const compact = document.querySelector('[data-slot="compact-timer-card"]') as HTMLElement
      expect(compact).not.toBeNull()
      expect(compact.querySelector('[data-slot="timer-card-reached"]')).toHaveTextContent("3 years")
    })

    it("has no format switch for a timer younger than one month", () => {
      render(<TimerCard timer={{ ...sinceWeMet, targetDate: "2026-10-20T09:00:00.000Z" }} nowMs={Date.now()} />)

      expect(document.querySelector('[data-slot="count-up-format-toggle"]')).toBeNull()
    })

    it("shows the next milestone with progress on an ordinary day", () => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-20T12:00:00.000Z"))
      render(<TimerCard timer={sinceWeMet} nowMs={Date.now()} />)

      expect(document.querySelector('[data-slot="milestone-reached-badge"]')).toBeNull()
      expect(document.querySelector('[data-slot="timer-card-next"]')).toHaveTextContent("Next: 4 years · in 354 days")
      const bar = document.querySelector('[data-slot="milestone-progress"] > div') as HTMLElement
      expect(bar.style.transform).toMatch(/^scaleX\(0\.0/)
    })
  })

  it("shows no drag handle unless the sort mode is Manual order", () => {
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    expect(document.querySelector('[data-slot="timer-drag-handle"]')).toBeNull()
  })

  it("puts the handle on count-ups too and moves cards from the menu in Manual order", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <TimerCard
        timer={makeTimer({ label: "Parcel", mode: "since", targetDate: "2026-05-01T00:00:00.000Z" })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
        sortable
        onMove={onMove}
        canMoveEarlier={false}
        canMoveLater
      />,
    )

    expect(screen.getAllByRole("button", { name: "Reorder Parcel" }).length).toBeGreaterThan(0)
    await openFirstTimerActions(user)
    expect(await screen.findByRole("menuitem", { name: "Move earlier" })).toHaveAttribute("aria-disabled", "true")
    await user.click(screen.getByRole("menuitem", { name: "Move later" }))
    expect(onMove).toHaveBeenCalledWith("timer-a", 1)
  })

  it("slides the handle in only when Manual order has just started", () => {
    const { rerender } = render(
      <TimerCard
        timer={makeTimer()}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
        sortable
        handleEntranceDelayMs={60}
      />,
    )
    const handle = document.querySelector('[data-slot="timer-drag-handle"]') as HTMLElement
    expect(handle).toHaveClass("animate-in", "motion-reduce:slide-in-from-left-0")
    expect(handle.style.animationDelay).toBe("60ms")

    rerender(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} sortable />)
    expect(document.querySelector('[data-slot="timer-drag-handle"]')).not.toHaveClass("animate-in")
  })

  it("keeps Pin available outside Manual order", () => {
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    expect(screen.getAllByRole("button", { name: /Pin/ }).length).toBeGreaterThan(0)
  })

  it("renders the dense card for the desktop grid with Pin in its menu", async () => {
    const user = userEvent.setup()
    render(<TimerCard timer={makeTimer({ label: "Train" })} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} compact />)

    const compact = document.querySelector('[data-slot="compact-timer-card"]')
    expect(compact).not.toBeNull()
    expect(compact?.querySelector('[data-slot="timer-card-date"]')).toHaveTextContent("May 25, 2026 · 14:00")
    // The phone copy keeps the full card.
    expect(document.querySelectorAll("article")).toHaveLength(2)

    const menus = screen.getAllByRole("button", { name: "Open timer actions" })
    await user.click(menus[menus.length - 1])
    await user.click(await screen.findByRole("menuitem", { name: "Pin to top" }))
    expect(storeState.setPinnedTimer).toHaveBeenCalledWith("timer-a")
  })

  it("keeps the full card for an attention count-up so its decision controls stay", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-05-25T13:00:00.000Z"))
    render(
      <TimerCard
        timer={makeTimer()}
        nowMs={Date.now()}
        compact
        countUpOccurrence={countUpOccurrence}
        countUpPlacement="section"
      />,
    )

    expect(document.querySelector('[data-slot="compact-timer-card"]')).toBeNull()
  })

  it("labels an exhausted finite milestone ladder", () => {
    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2024-01-01T10:00:00.000Z",
          mode: "since",
          milestones: { rules: [{ unit: "days", at: [1, 3] }] },
          notify: false,
        })}
        nowMs={Date.parse("2024-02-01T10:00:00.000Z")}
      />,
    )

    expect(screen.getAllByText(/Milestone ladder complete/)[0]).toBeVisible()
  })

  it("renders compact decision and scheduled-status controls beside the badge", () => {
    const nowMs = Date.parse("2026-05-25T13:00:00.000Z")
    vi.spyOn(Date, "now").mockReturnValue(nowMs)
    render(
      <TimerCard
        timer={makeTimer()}
        nowMs={nowMs}
        countUpOccurrence={{
          ...countUpOccurrence,
          firstSeenAt: nowMs,
          deferredUntil: nowMs + 30 * 60 * 1000,
        }}
        countUpPlacement="section"
      />,
    )

    const badges = screen.getAllByText("COUNTING UP")
    expect(badges.length).toBeGreaterThan(0)
    expect(badges[0]).toHaveClass("bg-muted", "text-foreground")
    expect(badges[0].className).not.toMatch(/red/)
    expect(screen.queryByText(/Started counting up at/)).not.toBeInTheDocument()
    const acknowledge = screen.getAllByRole("button", {
      name: "Acknowledge",
    })[0]
    expect(acknowledge).toHaveClass("h-[18px]", "text-[9px]")
    expect(acknowledge).toHaveTextContent("Acknowledge")
    expect(acknowledge.querySelector("svg")).toBeInTheDocument()
    const scheduled = screen.getAllByRole("img", {
      name: "Scheduled to acknowledge in about 30 minutes",
    })[0]
    expect(scheduled).toHaveClass("size-[18px]")
    expect(scheduled.querySelector("svg")).toBeInTheDocument()
    expect(screen.queryByText("Moves to Counting up in about 30 minutes")).not.toBeInTheDocument()
  })

  it("calculates a deferred status from the live clock rather than the stale classification clock", () => {
    const liveNowMs = Date.parse("2026-05-25T13:05:00.000Z")
    vi.spyOn(Date, "now").mockReturnValue(liveNowMs)

    render(
      <TimerCard
        timer={makeTimer()}
        nowMs={liveNowMs - 5 * 60 * 1000}
        countUpOccurrence={{
          ...countUpOccurrence,
          firstSeenAt: liveNowMs,
          deferredUntil: liveNowMs + 60 * 60 * 1000,
        }}
        countUpPlacement="section"
      />,
    )

    expect(
      screen.getAllByRole("img", {
        name: "Scheduled to acknowledge in about 60 minutes",
      })[0],
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("img", {
        name: "Scheduled to acknowledge in about 65 minutes",
      }),
    ).not.toBeInTheDocument()
  })

  it("renders the scheduled countdown from the persisted Review deadline", () => {
    const liveNowMs = Date.parse("2026-05-25T13:05:00.000Z")
    vi.spyOn(Date, "now").mockReturnValue(liveNowMs)

    render(
      <TimerCard
        timer={makeTimer()}
        nowMs={liveNowMs}
        countUpOccurrence={{
          ...countUpOccurrence,
          firstSeenAt: liveNowMs - 10 * 60 * 1000,
          reviewExpiresAt: liveNowMs + 5 * 60 * 1000,
          policy: { mode: "after-seen-15m", minutes: null },
        }}
        countUpPlacement="section"
      />,
    )

    expect(screen.getAllByRole("img", { name: "Scheduled to acknowledge in about 5 minutes" })[0]).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Scheduled to acknowledge in about 15 minutes" })).not.toBeInTheDocument()
  })

  it("exposes stable project, timer, and occurrence targets for attention navigation", () => {
    render(
      <TimerCard
        timer={makeTimer({ id: "timer-a" })}
        nowMs={Date.parse("2026-05-25T13:00:00.000Z")}
        projectId="project_123"
        countUpOccurrence={countUpOccurrence}
        countUpPlacement="section"
      />,
    )

    const card = document.querySelector("[data-count-up-timer-id='timer-a']")
    expect(card).toHaveAttribute("data-count-up-project-id", "project_123")
    expect(card).toHaveAttribute("data-count-up-target-at-ms", String(countUpOccurrence.targetAtMs))
    expect(screen.getAllByText("NEW").length).toBeGreaterThan(0)
  })

  it("acknowledges a count-up timer into Counting up and offers Undo", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer()}
        nowMs={Date.parse("2026-05-25T13:00:00.000Z")}
        countUpOccurrence={countUpOccurrence}
        countUpPlacement="section"
      />,
    )

    const acknowledgeButton = screen.getAllByRole("button", {
      name: "Acknowledge",
    })[0]
    expect(acknowledgeButton).toHaveAttribute("aria-describedby")
    await user.hover(acknowledgeButton)
    expect(
      await screen.findAllByText("Moves the timer to its place in Counting up. It keeps counting up."),
    ).not.toHaveLength(0)
    await user.click(acknowledgeButton)
    await user.click(await screen.findByRole("menuitem", { name: "Acknowledge" }))
    expect(storeState.acknowledgeCountUps).toHaveBeenCalledWith([countUpOccurrence.key])
    expect(analyticsTrack).toHaveBeenCalledWith("transition_acknowledged", {
      policy: "until-i-move-it",
      secondsFromCrossedAtToFirstSeen: undefined,
      sectionSize: 0,
    })
    expect(toastMock).toHaveBeenCalledWith(
      "Moved to Counting up",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "Undo",
          onClick: expect.any(Function),
        }),
      }),
    )

    const [, options] = toastMock.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(storeState.unacknowledgeCountUps).toHaveBeenCalledWith([countUpOccurrence.key])
    expect(analyticsTrack).toHaveBeenCalledWith("transition_undo", {
      policy: "until-i-move-it",
      secondsFromCrossedAtToFirstSeen: undefined,
      sectionSize: 1,
    })
  })

  it("pins and acknowledges an attention timer with a complete Undo", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer()}
        nowMs={Date.parse("2026-05-25T13:00:00.000Z")}
        countUpOccurrence={countUpOccurrence}
        countUpPlacement="section"
      />,
    )

    await user.click(screen.getAllByRole("button", { name: "Pin timer to top" })[0])
    expect(storeState.setPinnedTimer).toHaveBeenCalledWith("timer-a")
    expect(storeState.acknowledgeCountUps).toHaveBeenCalledWith([countUpOccurrence.key])
    expect(analyticsTrack).toHaveBeenCalledWith("transition_pinned", {
      policy: "until-i-move-it",
      secondsFromCrossedAtToFirstSeen: undefined,
      sectionSize: 0,
    })

    const [, options] = toastMock.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(storeState.setPinnedTimer).toHaveBeenCalledTimes(2)
    expect(storeState.unacknowledgeCountUps).toHaveBeenCalledWith([countUpOccurrence.key])
  })

  it("defers a count-up from the compact decision menu instead of the overflow menu", async () => {
    const nowMs = Date.parse("2026-05-25T13:00:00.000Z")
    vi.spyOn(Date, "now").mockReturnValue(nowMs)
    const user = userEvent.setup()
    render(
      <TimerCard timer={makeTimer()} nowMs={nowMs} countUpOccurrence={countUpOccurrence} countUpPlacement="section" />,
    )

    await user.click(screen.getAllByRole("button", { name: "Acknowledge" })[0])
    await user.click(await screen.findByRole("menuitem", { name: "15 minutes" }))

    expect(storeState.deferCountUps).toHaveBeenCalledWith([countUpOccurrence.key], nowMs + 15 * 60 * 1000)
    expect(analyticsTrack).toHaveBeenCalledWith("transition_extended", {
      policy: "until-i-move-it",
      secondsFromCrossedAtToFirstSeen: undefined,
      sectionSize: 1,
    })

    await openFirstTimerActions(user)
    expect(screen.queryByRole("menuitem", { name: "15 minutes" })).not.toBeInTheDocument()
  })

  it("archives active timers from the per-timer action", async () => {
    const user = userEvent.setup()
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    const actionMenuButton = await openFirstTimerActions(user)
    expect(actionMenuButton).toHaveClass("text-muted-foreground/75")
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }))

    expect(storeState.archiveTimer).toHaveBeenCalledWith("timer-a")
    expect(toastMock).toHaveBeenCalledWith(
      "Timer archived.",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "Undo",
          onClick: expect.any(Function),
        }),
      }),
    )

    const [, options] = toastMock.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    options.action.onClick()
    expect(storeState.unarchiveTimer).toHaveBeenCalledWith("timer-a")
  })

  it("shows archived state and restores archived timers", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer({ archivedAt: "2026-05-23T00:00:00.000Z" })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
        sortable={false}
      />,
    )

    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0)
    await clickFirstTimerAction(user, "Restore")
    expect(storeState.unarchiveTimer).toHaveBeenCalledWith("timer-a")
    expect(toastMock).toHaveBeenCalledWith(
      "Timer restored.",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "Undo",
          onClick: expect.any(Function),
        }),
      }),
    )

    const [, options] = toastMock.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    options.action.onClick()
    expect(storeState.archiveTimer).toHaveBeenCalledWith("timer-a")
  })

  it("pins and unpins active timers", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await user.click(screen.getAllByRole("button", { name: "Pin timer to top" })[0])
    expect(storeState.setPinnedTimer).toHaveBeenCalledWith("timer-a")

    rerender(<TimerCard timer={makeTimer({ pinned: true })} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)
    await user.click(screen.getAllByRole("button", { name: "Unpin timer" })[0])
    // Toggle semantics: unpin targets this timer (others may stay pinned).
    expect(storeState.setPinnedTimer).toHaveBeenCalledWith("timer-a")
  })

  it("opens focus mode from the card icon and closes it with the exit button", async () => {
    const user = userEvent.setup()
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    const focusButton = screen.getAllByRole("button", {
      name: "Focus timer",
    })[0]
    await user.click(focusButton)

    const dialog = await screen.findByRole("dialog", { name: "Launch" })
    expect(dialog).toBeVisible()
    expect(dialog.tagName).toBe("DIALOG")
    expect(dialog.querySelector(".font-mono.tabular-nums")).toBeInTheDocument()
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"))

    const exitButton = screen.getByRole("button", { name: "Exit focus mode" })
    await waitFor(() => expect(exitButton).toHaveFocus())
    await user.click(exitButton)

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Launch" })).not.toBeInTheDocument()
    })
    await waitFor(() => expect(document.body.style.overflow).toBe(""))
    await waitFor(() => expect(focusButton).toHaveFocus())
  })

  it("traps keyboard focus inside focus mode", async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Behind control</button>
        <TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />
        <button type="button">After focus mode</button>
      </>,
    )

    await user.click(screen.getAllByRole("button", { name: "Focus timer" })[0])

    const exitButton = await screen.findByRole("button", {
      name: "Exit focus mode",
    })
    await waitFor(() => expect(exitButton).toHaveFocus())

    const lastThemeButton = screen.getByRole("button", {
      name: "Butter background",
    })
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(lastThemeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: "Tab" })
    expect(exitButton).toHaveFocus()

    const outsideButton = screen.getByRole("button", {
      name: "After focus mode",
    })
    outsideButton.focus()
    expect(outsideButton).toHaveFocus()

    fireEvent.keyDown(document, { key: "Tab" })
    expect(exitButton).toHaveFocus()
  })

  it("exits focus mode with Escape", async () => {
    const user = userEvent.setup()
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await user.click(screen.getAllByRole("button", { name: "Focus timer" })[0])
    expect(await screen.findByRole("dialog", { name: "Launch" })).toBeVisible()

    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Launch" })).not.toBeInTheDocument()
      expect(document.body.style.overflow).toBe("")
    })
  })

  it("persists focus mode background selection to localStorage", async () => {
    const user = userEvent.setup()
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    const focusButton = screen.getAllByRole("button", {
      name: "Focus timer",
    })[0]
    await user.click(focusButton)
    await user.click(await screen.findByRole("button", { name: "Mint background" }))

    expect(localStorage.getItem(TIMER_FOCUS_THEME_STORAGE_KEY)).toBe("mint")
    expect(screen.getByRole("button", { name: "Mint background" })).toHaveAttribute("aria-pressed", "true")

    await user.click(screen.getByRole("button", { name: "Exit focus mode" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Launch" })).not.toBeInTheDocument()
    })

    await user.click(focusButton)

    expect(await screen.findByRole("dialog", { name: "Launch" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Mint background" })).toHaveAttribute("aria-pressed", "true")
  })

  it("explains the locked overflow edit action for followed timers", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer({ sourceShareId: "share_public_launch" })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await openFirstTimerActions(user)

    const lockedEditItems = screen.getAllByRole("menuitem", { name: "Edit" })
    expect(lockedEditItems[0]).toHaveAttribute("data-disabled")
    expect(screen.getAllByText("Can't edit followed timers. Unfollow or duplicate.").length).toBeGreaterThan(0)
  })

  it("keeps secondary timer actions inside the overflow menu", async () => {
    const user = userEvent.setup()
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Archive timer" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Duplicate timer" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete timer" })).not.toBeInTheDocument()

    await openFirstTimerActions(user)

    expect(screen.getAllByRole("menuitem")[0]).toHaveTextContent("Edit")
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Disable notifications" })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeVisible()
    expect(screen.queryByRole("menuitem", { name: "Unfollow" })).not.toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute("data-variant", "destructive")

    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Disable notifications" })).not.toBeInTheDocument()
    })
  })

  it("deletes unshared timers immediately and restores the same id on undo", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer({ afterZero: { mode: "keep-visible", minutes: 45 } })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Delete")

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(storeState.removeTimer).toHaveBeenCalledWith("timer-a")
    expect(toastMock).toHaveBeenCalledWith(
      "Timer deleted.",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "Undo",
          onClick: expect.any(Function),
        }),
      }),
    )

    const [, options] = toastMock.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(storeState.addTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "timer-a",
        afterZero: { mode: "keep-visible", minutes: 45 },
      }),
    )
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it("shows an error when undoing a delete fails on the timer limit", async () => {
    const user = userEvent.setup()
    storeState.addTimer = vi.fn().mockReturnValue(false)
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await clickFirstTimerAction(user, "Delete")

    const [, options] = toastMock.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(toastMock.error).toHaveBeenCalledWith(
      "You already have the maximum number of active timers. Remove one to add more.",
    )
  })

  it("asks for confirmation before deleting a shared timer", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer({ sharedAt: "2026-05-23T00:00:00.000Z" })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Delete")

    expect(await screen.findByRole("alertdialog", { name: "Delete shared timer?" })).toBeVisible()
    expect(storeState.removeTimer).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Delete" }))
    expect(storeState.removeTimer).toHaveBeenCalledWith("timer-a")
  })

  it("keeps a shared timer when the delete confirmation is cancelled", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer({ sharedAt: "2026-05-23T00:00:00.000Z" })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Delete")
    await user.click(await screen.findByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })
    expect(storeState.removeTimer).not.toHaveBeenCalled()
  })

  it("opens the edit form from the overflow menu", async () => {
    const user = userEvent.setup()
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await clickFirstTimerAction(user, "Edit")

    expect(await screen.findByRole("dialog", { name: "Edit timer" }, { timeout: 4000 })).toBeVisible()
  })

  it("enables a timer local alarm without browser notification permission", async () => {
    const user = userEvent.setup()
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: {
        permission: "denied",
      },
    })
    localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEYS.fullPageAlarm, "1")

    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2026-05-25T00:00:00.000Z",
          notify: false,
        })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Enable notifications")

    expect(storeState.updateTimer).toHaveBeenCalledWith("timer-a", {
      notify: true,
    })
    expect(toastMock.success).toHaveBeenCalledWith("Timer alarm enabled.")
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it("disables timer notifications from the state-aware overflow item", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2026-05-25T00:00:00.000Z",
          notify: true,
        })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Disable notifications")

    expect(storeState.updateTimer).toHaveBeenCalledWith("timer-a", {
      notify: false,
    })
    expect(toastMock.success).toHaveBeenCalledWith("Notifications disabled for this timer.")
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Disable notifications" })).not.toBeInTheDocument()
    })
  })

  it("asks anonymous users to sign in before enabling timer alerts", async () => {
    const user = userEvent.setup()
    authMocks.useSession.mockReturnValue({ data: null })

    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2026-05-25T00:00:00.000Z",
          notify: false,
        })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Enable notifications")

    expect(storeState.updateTimer).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith("Sign in to turn on alerts in Settings.")
  })

  it("points signed-in users to alarm settings when no alert mode is available", async () => {
    const user = userEvent.setup()

    render(
      <TimerCard
        timer={makeTimer({
          targetDate: "2026-05-25T00:00:00.000Z",
          notify: false,
        })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Enable notifications")

    expect(storeState.updateTimer).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith("Open Settings and choose how timer alarms should run.")
  })

  it("opens the detail view when the card body is clicked", async () => {
    const user = userEvent.setup()

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    const openers = screen.getAllByRole("button", { name: "Open Launch" })
    // One opener per layout tree (phone and desktop); only one is visible at a time.
    expect(openers).toHaveLength(2)
    await user.click(openers[1])

    expect(await screen.findByRole("dialog", { name: "Launch" }, { timeout: 4000 })).toBeVisible()
    expect(screen.queryByRole("dialog", { name: "Edit timer" })).not.toBeInTheDocument()
  })

  it("mounts one detail view per card, and only once someone reaches for it", async () => {
    const idle = Object.getOwnPropertyDescriptor(globalThis, "requestIdleCallback")
    const cancelIdle = Object.getOwnPropertyDescriptor(globalThis, "cancelIdleCallback")
    Object.assign(globalThis, {
      requestIdleCallback: (callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 50 })
        return 1
      },
      cancelIdleCallback: () => {},
    })
    try {
      // Let the counting mock finish loading first: an import made while its factory still
      // runs gets the original module.
      await import("@/components/timer-detail/timer-detail-dialog")
      const user = userEvent.setup()

      const { unmount } = render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)
      await act(async () => {})
      // An idle page loads the view's code but mounts no view.
      expect(detailDialogMounts.current).toBe(0)

      const openers = screen.getAllByRole("button", { name: "Open Launch" })
      fireEvent.pointerDown(openers[0])
      fireEvent.pointerDown(openers[1])
      await user.click(openers[1])
      expect(await screen.findByRole("dialog", { name: "Launch" }, { timeout: 4000 })).toBeVisible()
      expect(detailDialogMounts.current).toBe(1)
      unmount()
    } finally {
      for (const [name, descriptor] of [
        ["requestIdleCallback", idle],
        ["cancelIdleCallback", cancelIdle],
      ] as const) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
      }
    }
  })

  it("opens the detail view from the keyboard", async () => {
    const user = userEvent.setup()
    setViewportMobile(true)

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    screen.getAllByRole("button", { name: "Open Launch" })[0].focus()
    await user.keyboard("{Enter}")

    expect(await screen.findByRole("dialog", { name: "Launch" }, { timeout: 4000 })).toBeVisible()
  })

  it("keeps the card controls above the detail opener", () => {
    render(
      <TimerCard
        timer={makeTimer({ url: "https://example.com" })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
        sortable
      />,
    )

    for (const handle of screen.getAllByRole("button", { name: "Reorder Launch" })) {
      expect(handle.className).toMatch(/\bz-20\b/)
    }
    for (const link of screen.getAllByRole("link", { name: "Open link" })) {
      expect(link.className).toMatch(/\bz-10\b/)
    }
    const outerActions = [...document.querySelectorAll("[data-timer-card-action]")].filter(
      (element) => !element.parentElement?.closest("[data-timer-card-action]"),
    )
    expect(outerActions.length).toBeGreaterThan(3)
    for (const actions of outerActions) {
      expect(actions.className).toMatch(/\bz-(10|20)\b/)
    }
  })

  it("does not open the detail view when a drag on the handle ends", () => {
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} sortable />)

    const handle = screen.getAllByRole("button", { name: "Reorder Launch" })[1]
    fireEvent.pointerDown(handle, { clientX: 20, clientY: 20 })
    fireEvent.pointerMove(handle, { clientX: 20, clientY: 90 })
    fireEvent.pointerUp(handle, { clientX: 20, clientY: 90 })
    fireEvent.click(handle)

    expect(screen.queryByRole("dialog", { name: "Launch" })).not.toBeInTheDocument()
  })

  it("keeps mobile swipe gestures from opening the edit form", () => {
    setViewportMobile(true)

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    const title = screen.getAllByText("Launch")[0]
    fireEvent.pointerDown(title, { clientX: 20, clientY: 20 })
    fireEvent.pointerUp(title, { clientX: 70, clientY: 20 })

    expect(screen.queryByRole("dialog", { name: "Edit timer" })).not.toBeInTheDocument()
  })

  it("does not open the edit form when tapping mobile action buttons", async () => {
    const user = userEvent.setup()
    setViewportMobile(true)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("share status unavailable")))

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await clickFirstTimerAction(user, "Share")

    expect(screen.queryByRole("dialog", { name: "Edit timer" })).not.toBeInTheDocument()
  })

  it("does not leak technical share errors to users", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal share stack")))

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await clickFirstTimerAction(user, "Share")
    await waitFor(() => expect(screen.getByRole("button", { name: "Create link" })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: "Create link" }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Share link generation failed."))
    expect(toastMock.error).not.toHaveBeenCalledWith("internal share stack")
  })

  it("reuses the created share URL instead of creating duplicate links", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => {
      const [url] = args
      if (url === "/api/share/status") return Response.json({ url: null })
      if (url === "/api/share/create") return Response.json({ url: "/share/timer_staticShareId1234567890" })
      return new Response(null, { status: 404 })
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("fetch", fetchMock)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await clickFirstTimerAction(user, "Share")
    await waitFor(() => expect(screen.getByRole("button", { name: "Create link" })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: "Create link" }))

    const shareUrl = `${globalThis.location.origin}/share/timer_staticShareId1234567890`
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Share URL" })).toHaveDisplayValue(shareUrl))
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(storeState.syncToCloud).toHaveBeenCalledTimes(2)
    expect(storeState.syncToCloud).toHaveBeenCalledWith({ force: true })

    const createCall = fetchMock.mock.calls.find(([url]) => url === "/api/share/create")
    expect(createCall).toBeDefined()
    const init = createCall?.[1] as RequestInit
    expect(JSON.parse(init.body as string).owner).toEqual({
      projectId: "project_123",
      restoreKey: "restoreKey_123",
      timerId: "timer-a",
    })

    await user.click(screen.getByRole("button", { name: "Copy link" }))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(writeText).toHaveBeenLastCalledWith(shareUrl)
  })

  it("shows an existing share link without creating it again", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => {
      const [url] = args
      if (url === "/api/share/status") return Response.json({ url: "/share/timer_existingShareId1234567890" })
      if (url === "/api/share/create") throw new Error("create should not be called")
      return new Response(null, { status: 404 })
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("fetch", fetchMock)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await clickFirstTimerAction(user, "Share")

    const shareUrl = `${globalThis.location.origin}/share/timer_existingShareId1234567890`
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Share URL" })).toHaveDisplayValue(shareUrl))
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible()
    expect(storeState.syncToCloud).toHaveBeenCalledWith({ force: true })

    await user.click(screen.getByRole("button", { name: "Copy link" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalledWith("/api/share/create", expect.anything())
    expect(writeText).toHaveBeenCalledWith(shareUrl)
  })

  it("offers to restore a shared timer link when the server record is missing", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => {
      const [url] = args
      if (url === "/api/share/status") return Response.json({ url: null })
      if (url === "/api/share/create") return Response.json({ url: "/share/timer_restoredShareId1234567890" })
      return new Response(null, { status: 404 })
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("fetch", fetchMock)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(
      <TimerCard
        timer={makeTimer({ sharedAt: "2026-05-23T00:00:00.000Z" })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Share")
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore link" })).toBeEnabled())
    expect(screen.queryByRole("button", { name: "Create link" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Restore link" }))

    const shareUrl = `${globalThis.location.origin}/share/timer_restoredShareId1234567890`
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Share URL" })).toHaveDisplayValue(shareUrl))
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith("/api/share/create", expect.anything())
    expect(writeText).toHaveBeenCalledWith(shareUrl)
  })
})
