import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TimerCard } from "@/components/timer-card"
import { TIMER_FOCUS_THEME_STORAGE_KEY } from "@/components/timer-focus-mode"
import { LOCAL_NOTIFICATION_STORAGE_KEYS } from "@/lib/notification-preferences"
import type { TimerStore } from "@/lib/store"
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
  const menuButton = screen.getAllByRole("button", { name: "Open timer actions" })[0]
  await user.click(menuButton)
  return menuButton
}

async function clickFirstTimerAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openFirstTimerActions(user)
  await user.click(await screen.findByRole("menuitem", { name }))
}

describe("TimerCard", () => {
  beforeEach(() => {
    authMocks.useSession.mockReset()
    authMocks.useSession.mockReturnValue({ data: { user: { id: "user_123", email: "ada@example.com" } } })
    localStorage.clear()
    document.body.style.overflow = ""
    Reflect.deleteProperty(globalThis, "Notification")
    setViewportMobile(false)
    toastMock.mockClear()
    toastMock.success.mockClear()
    toastMock.error.mockClear()
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
      unfollowTimer: vi.fn(),
      syncToCloud: vi.fn().mockResolvedValue(true),
    }
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
        action: expect.objectContaining({ label: "Undo", onClick: expect.any(Function) }),
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
        action: expect.objectContaining({ label: "Undo", onClick: expect.any(Function) }),
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

    const focusButton = screen.getAllByRole("button", { name: "Focus timer" })[0]
    await user.click(focusButton)

    const dialog = await screen.findByRole("dialog", { name: "Launch" })
    expect(dialog).toBeVisible()
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

    const exitButton = await screen.findByRole("button", { name: "Exit focus mode" })
    await waitFor(() => expect(exitButton).toHaveFocus())

    const lastThemeButton = screen.getByRole("button", { name: "Butter background" })
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(lastThemeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: "Tab" })
    expect(exitButton).toHaveFocus()

    const outsideButton = screen.getByRole("button", { name: "After focus mode" })
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

    const focusButton = screen.getAllByRole("button", { name: "Focus timer" })[0]
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
    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await clickFirstTimerAction(user, "Delete")

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(storeState.removeTimer).toHaveBeenCalledWith("timer-a")
    expect(toastMock).toHaveBeenCalledWith(
      "Timer deleted.",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo", onClick: expect.any(Function) }),
      }),
    )

    const [, options] = toastMock.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(storeState.addTimer).toHaveBeenCalledWith(expect.objectContaining({ id: "timer-a" }))
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
        timer={makeTimer({ targetDate: "2026-05-25T00:00:00.000Z", notify: false })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Enable notifications")

    expect(storeState.updateTimer).toHaveBeenCalledWith("timer-a", { notify: true })
    expect(toastMock.success).toHaveBeenCalledWith("Timer alarm enabled.")
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it("disables timer notifications from the state-aware overflow item", async () => {
    const user = userEvent.setup()
    render(
      <TimerCard
        timer={makeTimer({ targetDate: "2026-05-25T00:00:00.000Z", notify: true })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Disable notifications")

    expect(storeState.updateTimer).toHaveBeenCalledWith("timer-a", { notify: false })
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
        timer={makeTimer({ targetDate: "2026-05-25T00:00:00.000Z", notify: false })}
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
        timer={makeTimer({ targetDate: "2026-05-25T00:00:00.000Z", notify: false })}
        nowMs={Date.parse("2026-05-24T00:00:00.000Z")}
      />,
    )

    await clickFirstTimerAction(user, "Enable notifications")

    expect(storeState.updateTimer).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith("Open Settings and choose how timer alarms should run.")
  })

  it("opens the edit form when tapping the timer card body on mobile", async () => {
    const user = userEvent.setup()
    setViewportMobile(true)

    render(<TimerCard timer={makeTimer()} nowMs={Date.parse("2026-05-24T00:00:00.000Z")} />)

    await user.click(screen.getAllByText("Launch")[0])

    expect(await screen.findByRole("dialog", { name: "Edit timer" }, { timeout: 4000 })).toBeVisible()
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
