import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationBell } from "@/components/notification-bell"
import { TooltipProvider } from "@/components/ui/tooltip"

const mocks = vi.hoisted(() => ({
  inbox: {
    items: [] as Array<{
      id: string
      type: string
      timer_id: string | null
      project_id: string | null
      payload: unknown
      read_at: string | null
      created_at: string
    }>,
    loading: false,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    nextCursor: null as string | null,
    signedIn: true,
    unreadCount: 0,
  },
}))

vi.mock("@/components/use-inbox", () => ({
  useInbox: () => mocks.inbox,
}))

function renderBell() {
  return render(
    <TooltipProvider delayDuration={0}>
      <NotificationBell />
    </TooltipProvider>,
  )
}

describe("NotificationBell", () => {
  beforeEach(() => {
    Object.assign(mocks.inbox, {
      items: [],
      loading: false,
      markAllRead: vi.fn(),
      markRead: vi.fn(),
      nextCursor: null,
      signedIn: true,
      unreadCount: 0,
    })
  })

  it("stays hidden for signed-out users", () => {
    mocks.inbox.signedIn = false

    renderBell()

    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument()
  })

  it("shows unread reminders and marks an item read on click", async () => {
    const user = userEvent.setup()
    mocks.inbox.unreadCount = 12
    mocks.inbox.items = [
      {
        id: "inbox_123",
        type: "timer.reminder",
        timer_id: "timer_123",
        project_id: "project_123",
        payload: { label: "Launch", offsetMinutes: 10 },
        read_at: null,
        created_at: "2026-07-03T12:00:00.000Z",
      },
    ]

    renderBell()

    await user.click(screen.getByRole("button", { name: "12 unread notifications" }))

    expect(screen.getByText("9+")).toBeVisible()
    const popover = screen.getByText("Notifications").closest("[data-slot='popover-content']")
    expect(popover).not.toBeNull()
    expect(within(popover as HTMLElement).getByText("Launch")).toBeVisible()
    expect(within(popover as HTMLElement).getByText(/10 minutes before/)).toBeVisible()

    await user.click(within(popover as HTMLElement).getByRole("button", { name: /Launch/ }))

    expect(mocks.inbox.markRead).toHaveBeenCalledWith(["inbox_123"])
  })

  it("marks all read from the popover header", async () => {
    const user = userEvent.setup()
    mocks.inbox.unreadCount = 2
    mocks.inbox.items = [
      {
        id: "inbox_123",
        type: "timer.reminder",
        timer_id: "timer_123",
        project_id: null,
        payload: { label: "Launch", offsetMinutes: 60 },
        read_at: null,
        created_at: "2026-07-03T12:00:00.000Z",
      },
    ]

    renderBell()

    await user.click(screen.getByRole("button", { name: "2 unread notifications" }))
    await user.click(screen.getByRole("button", { name: "Mark all read" }))

    expect(mocks.inbox.markAllRead).toHaveBeenCalledTimes(1)
  })
})
