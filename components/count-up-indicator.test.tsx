import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  COUNT_UP_VIEW_EVENT,
  CountUpNotificationRouter,
  parseCountUpNotificationAction,
  parseCountUpNotificationHash,
} from "@/components/count-up-indicator"
import type { TimerStore } from "@/lib/store"
import type { CountUpOccurrence } from "@/lib/stores/count-up-store"
import type { Timer } from "@/lib/types"

let pathname = "/"
let storeState: Partial<TimerStore>
const routerPush = vi.fn()
const analyticsTrack = vi.hoisted(() => vi.fn())
const toastCall = vi.hoisted(() => vi.fn())
let originalServiceWorker: PropertyDescriptor | undefined

vi.mock("@/components/plausible-analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/plausible-analytics")>()
  return { ...original, trackCountUpAnalyticsEvent: analyticsTrack }
})

vi.mock("sonner", () => ({ toast: toastCall }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: routerPush }),
}))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

function occurrence(overrides: Partial<CountUpOccurrence> = {}): CountUpOccurrence {
  return {
    key: "timer-1|1000",
    projectId: "project-a",
    projectName: "Alpha",
    timerId: "timer-1",
    timer: { label: "Launch", pinned: false },
    targetAtMs: 1_000,
    crossedAt: 1_000,
    firstSeenAt: null,
    reviewExpiresAt: null,
    acknowledgedAt: null,
    deferredUntil: null,
    policy: { mode: "until-i-move-it", minutes: null },
    usesDefaultPolicy: true,
    ...overrides,
  }
}

function timer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: "timer-1",
    label: "Launch",
    targetDate: new Date(1_000).toISOString(),
    timezone: "UTC",
    createdAt: new Date(0).toISOString(),
    ...overrides,
  }
}

function installServiceWorkerMessages() {
  let listener: ((event: MessageEvent<unknown>) => void) | undefined
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: vi.fn((_type: string, nextListener: (event: MessageEvent<unknown>) => void) => {
        listener = nextListener
      }),
      removeEventListener: vi.fn(),
    },
  })
  return (data: unknown) => {
    act(() => listener?.({ data } as MessageEvent<unknown>))
  }
}

describe("CountUpNotificationRouter", () => {
  beforeEach(() => {
    originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker")
    pathname = "/"
    routerPush.mockReset()
    analyticsTrack.mockReset()
    toastCall.mockReset()
    storeState = {
      hasHydrated: true,
      countUpOccurrences: [],
      timers: [],
      acknowledgeCountUpsForProject: vi.fn(),
      unacknowledgeCountUpsForProject: vi.fn(),
      openCountUpProject: vi.fn(),
    }
    sessionStorage.clear()
    window.history.replaceState(null, "", "/")
  })

  afterEach(() => {
    if (originalServiceWorker) Object.defineProperty(navigator, "serviceWorker", originalServiceWorker)
    else Reflect.deleteProperty(navigator, "serviceWorker")
  })

  it("renders no global header summary after hydration", () => {
    storeState.countUpOccurrences = [occurrence()]
    const { container } = render(<CountUpNotificationRouter />)
    expect(container).toBeEmptyDOMElement()
  })

  it("opens a validated timer notification in its project without mutating review state", () => {
    const sendMessage = installServiceWorkerMessages()
    storeState.countUpOccurrences = [occurrence()]
    storeState.timers = [timer()]
    document.body.insertAdjacentHTML("beforeend", '<section data-slot="timer-list-section"></section>')
    const targetedView = vi.fn()
    globalThis.addEventListener(COUNT_UP_VIEW_EVENT, targetedView, { once: true })
    render(<CountUpNotificationRouter />)

    sendMessage({
      type: "TIMER_COUNT_UP_NOTIFICATION_ACTION",
      kind: "timer",
      action: "view",
      projectId: "project-a",
      timerId: "timer-1",
      targetAtMs: 1_000,
    })

    expect(storeState.openCountUpProject).toHaveBeenCalledWith("project-a")
    expect(targetedView).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { projectId: "project-a", timerId: "timer-1", targetAtMs: 1_000 } }),
    )
    expect(storeState.acknowledgeCountUpsForProject).not.toHaveBeenCalled()
  })

  it("routes a coalesced notification to the newest active occurrence instead of a drawer", () => {
    const sendMessage = installServiceWorkerMessages()
    pathname = "/de/settings"
    storeState.countUpOccurrences = [
      occurrence(),
      occurrence({
        key: "timer-2|2000",
        projectId: "project-b",
        projectName: "Beta",
        timerId: "timer-2",
        targetAtMs: 2_000,
        crossedAt: 2_000,
      }),
    ]
    render(<CountUpNotificationRouter />)

    sendMessage({ type: "TIMER_ATTENTION_NOTIFICATION_ACTION", kind: "review", action: "review" })

    expect(storeState.openCountUpProject).toHaveBeenCalledWith("project-b")
    expect(routerPush).toHaveBeenCalledWith("/de")
    expect(sessionStorage.getItem("tickward:count-up:target")).toContain('"timerId":"timer-2"')
    expect(storeState.acknowledgeCountUpsForProject).not.toHaveBeenCalled()
  })

  it("acknowledges only the matching occurrence and offers Undo with the Counting up effect", () => {
    const sendMessage = installServiceWorkerMessages()
    storeState.countUpOccurrences = [occurrence(), occurrence({ key: "timer-1|500", targetAtMs: 500 })]
    storeState.timers = [timer()]
    render(<CountUpNotificationRouter />)

    sendMessage({
      type: "TIMER_ATTENTION_NOTIFICATION_ACTION",
      kind: "timer",
      action: "acknowledge",
      projectId: "project-a",
      timerId: "timer-1",
      targetAtMs: 1_000,
    })

    expect(storeState.acknowledgeCountUpsForProject).toHaveBeenCalledWith("project-a", ["timer-1|1000"])
    expect(toastCall).toHaveBeenCalledWith("Moved to Counting up", {
      action: { label: "Undo", onClick: expect.any(Function) },
    })
    toastCall.mock.calls[0]?.[1]?.action.onClick()
    expect(storeState.unacknowledgeCountUpsForProject).toHaveBeenCalledWith("project-a", ["timer-1|1000"])
  })

  it("rejects malformed and stale notification actions", () => {
    expect(parseCountUpNotificationAction(null)).toBeNull()
    expect(
      parseCountUpNotificationAction({
        type: "TIMER_COUNT_UP_NOTIFICATION_ACTION",
        kind: "timer",
        action: "delete",
        projectId: "project-a",
        timerId: "timer-1",
        targetAtMs: 1_000,
      }),
    ).toBeNull()

    const sendMessage = installServiceWorkerMessages()
    storeState.countUpOccurrences = [occurrence({ acknowledgedAt: 1_500 })]
    render(<CountUpNotificationRouter />)
    sendMessage({
      type: "TIMER_COUNT_UP_NOTIFICATION_ACTION",
      kind: "timer",
      action: "acknowledge",
      projectId: "project-a",
      timerId: "timer-1",
      targetAtMs: 1_000,
    })
    expect(storeState.acknowledgeCountUpsForProject).not.toHaveBeenCalled()
  })

  it("parses canonical and compatibility notification targets", () => {
    expect(parseCountUpNotificationHash("#count-up=review")).toEqual({ action: "review", kind: "review" })
    expect(parseCountUpNotificationHash("#attention=review")).toEqual({ action: "review", kind: "review" })
    expect(
      parseCountUpNotificationHash("#attention=timer&action=view&projectId=project-a&timerId=timer-1&targetAtMs=1000"),
    ).toEqual({
      action: "view",
      kind: "timer",
      projectId: "project-a",
      timerId: "timer-1",
      targetAtMs: 1_000,
    })
    expect(parseCountUpNotificationHash("#count-up=timer&action=delete")).toBeNull()
  })
})
