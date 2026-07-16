import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SettingsSheet } from "@/components/settings-sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TimerStore } from "@/lib/store"
import { makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

// Mock the auth client like every other test rendering session-aware components:
// the real client mounts better-auth's session atom, whose delayed nanostores
// cleanup can fire after jsdom teardown and crash the run with an unhandled
// "window is not defined" error.
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null }),
  },
}))

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}))

function renderSettingsSheet() {
  return render(
    <TooltipProvider delayDuration={0}>
      <SettingsSheet />
    </TooltipProvider>,
  )
}

describe("SettingsSheet", () => {
  beforeEach(() => {
    storeState = {
      projects: [
        {
          id: "project-a",
          name: "Alpha",
          restoreKey: "restoreKey_123",
          createdAt: "2026-05-20T00:00:00.000Z",
          updatedAt: "2026-05-20T00:00:00.000Z",
          hasUnsyncedChanges: false,
        },
      ],
      activeProjectId: "project-a",
      restoreKey: "restoreKey_123",
      timers: [makeTimer()],
      lastSyncError: null,
      isSyncing: false,
      isCheckingCloud: false,
      renameActiveProject: vi.fn(),
      syncToCloud: vi.fn().mockResolvedValue(true),
      refreshActiveProjectFromCloud: vi.fn().mockResolvedValue(undefined),
      deleteActiveProjectFromCloud: vi.fn().mockResolvedValue(undefined),
      clearAllTimers: vi.fn(),
      setCountUpPolicy: vi.fn(),
    }
  })

  it("keeps project actions focused on the active project", async () => {
    const user = userEvent.setup()
    renderSettingsSheet()

    await user.click(screen.getByRole("button", { name: "Project settings" }))

    expect(screen.getByLabelText("Name")).not.toHaveFocus()
    expect(screen.queryByText("Export this project's timers as JSON.")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Add project from key")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Device notifications" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Alarm defaults" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Cloud ready/)).not.toBeInTheDocument()

    const restoreKeyInput = screen.getByLabelText("Restore key")
    expect(restoreKeyInput).toHaveAttribute("type", "password")
    expect(restoreKeyInput).toHaveValue("restoreKey_123")
    expect(
      screen.getByText("Keep this key private. Reveal it only when you need this project on another device."),
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Show restore key" }))
    expect(restoreKeyInput).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Hide restore key" })).toBeVisible()

    expect(screen.queryByText("Remove from this device")).not.toBeInTheDocument()
    expect(screen.getByText("Clear this project's timers")).toBeInTheDocument()
    expect(
      screen.getByText("Removes all timers from the active project. The project and restore key stay."),
    ).toBeInTheDocument()
    expect(screen.getAllByText("Delete project").length).toBeGreaterThan(0)
    expect(screen.getByText("Deletes this project from cloud storage and removes it from this device.")).toBeVisible()

    expect(screen.getByRole("button", { name: "Clear project timers" })).toHaveAttribute("data-variant", "destructive")
    expect(screen.getByRole("button", { name: "Delete project" })).toHaveAttribute("data-variant", "destructive")
    expect(screen.queryByLabelText("When a countdown reaches zero")).not.toBeInTheDocument()
  })

  it("requires the active project name before destructive project actions", async () => {
    const user = userEvent.setup()
    renderSettingsSheet()

    await user.click(screen.getByRole("button", { name: "Project settings" }))
    await user.click(screen.getByRole("button", { name: "Clear project timers" }))

    const clearTimersAction = screen.getByRole("button", { name: "Clear timers" })
    expect(screen.getByLabelText('Type "Alpha" to confirm.')).toBeVisible()
    expect(clearTimersAction).toBeDisabled()

    await user.type(screen.getByLabelText('Type "Alpha" to confirm.'), "Alpha")
    expect(clearTimersAction).toBeEnabled()
    await user.click(clearTimersAction)
    expect(storeState.clearAllTimers).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Delete project" }))
    const deleteProjectDialog = screen.getByRole("alertdialog", { name: "Delete this project?" })
    const deleteProjectAction = within(deleteProjectDialog).getByRole("button", { name: "Delete project" })
    expect(deleteProjectAction).toBeDisabled()

    await user.type(screen.getByLabelText('Type "Alpha" to confirm.'), "Alpha")
    expect(deleteProjectAction).toBeEnabled()
    await user.click(deleteProjectAction)
    expect(storeState.deleteActiveProjectFromCloud).toHaveBeenCalledTimes(1)
  })

  it("hides and omits the restore key for account-backed projects", async () => {
    const user = userEvent.setup()
    storeState.projects = [
      {
        id: "project-a",
        name: "Alpha",
        restoreKey: "restoreKey_123",
        cloudProjectId: "project_cloud_123",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
        hasUnsyncedChanges: false,
      },
    ]

    renderSettingsSheet()

    await user.click(screen.getByRole("button", { name: "Project settings" }))

    expect(screen.queryByLabelText("Restore key")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Show restore key" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Copy restore key" })).not.toBeInTheDocument()
    expect(screen.getByText("Saved to your account")).toBeVisible()
    expect(
      screen.getByText(
        "This project is linked to your account and comes back after sign-in on this or another device.",
      ),
    ).toBeVisible()
    expect(screen.queryByText("Remove from this device")).not.toBeInTheDocument()
    expect(screen.getByText("Deletes this project from your account and removes it from this device.")).toBeVisible()
  })

  it("keeps sync error details in a tooltip", async () => {
    const user = userEvent.setup()
    storeState.lastSyncError = "Sign in to access this project."

    renderSettingsSheet()

    await user.click(screen.getByRole("button", { name: "Project settings" }))

    const status = screen.getByRole("button", { name: "Sync error" })
    expect(status).toBeVisible()
    expect(screen.queryByText("Sign in to access this project.")).not.toBeInTheDocument()

    await user.hover(status)

    expect((await screen.findAllByText("Sign in to access this project.")).length).toBeGreaterThan(0)
  })

  it("scrolls the settings body when wheel events originate from sheet overlays", async () => {
    const user = userEvent.setup()
    renderSettingsSheet()

    await user.click(screen.getByRole("button", { name: "Project settings" }))

    const scroller = document.querySelector<HTMLElement>('[data-slot="settings-scroll-container"]')
    expect(scroller).not.toBeNull()
    if (!scroller) return

    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 320 })
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 960 })

    fireEvent.wheel(screen.getByRole("dialog", { name: "Project settings" }), { deltaX: 0, deltaY: 180 })

    expect(scroller.scrollTop).toBe(180)
  })
})
