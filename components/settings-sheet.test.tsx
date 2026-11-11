import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SettingsSheet } from "@/components/settings-sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MESSAGES } from "@/lib/i18n/messages"
import type { TimerStore } from "@/lib/store"
import { makeTimer } from "@/test/factories"

let storeState: Partial<TimerStore>

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
    vi.mocked(toast.success).mockClear()
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
      spaces: [],
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

    const restoreKeyInput = screen.getByLabelText("Use on another device")
    expect(restoreKeyInput).toHaveAttribute("type", "password")
    expect(restoreKeyInput).toHaveValue("restoreKey_123")
    expect(
      screen.getByText(
        "Paste this restore key under New project on the other device, or sign in to keep the project in your account. Keep the key private.",
      ),
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Show restore key" }))
    expect(restoreKeyInput).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Hide restore key" })).toBeVisible()

    expect(screen.queryByText("Remove from this device")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clear timers" })).toHaveAttribute("data-variant", "outline")
    expect(screen.getByRole("button", { name: "Delete project" })).toHaveAttribute("data-variant", "outline")
    expect(screen.queryByLabelText("When a countdown reaches zero")).not.toBeInTheDocument()
  })

  it("requires the active project name before destructive project actions", async () => {
    const user = userEvent.setup()
    renderSettingsSheet()

    await user.click(screen.getByRole("button", { name: "Project settings" }))
    await user.click(screen.getByRole("button", { name: "Clear timers" }))

    const clearTimersAction = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Clear timers" })
    expect(within(screen.getByRole("alertdialog")).getByText(/The project and restore key stay/)).toBeVisible()
    expect(screen.getByLabelText('Type "Alpha" to confirm.')).toBeVisible()
    expect(clearTimersAction).toBeDisabled()

    await user.type(screen.getByLabelText('Type "Alpha" to confirm.'), "Alpha")
    expect(clearTimersAction).toBeEnabled()
    await user.click(clearTimersAction)
    expect(storeState.clearAllTimers).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Delete project" }))
    const deleteProjectDialog = screen.getByRole("alertdialog", { name: "Delete this project?" })
    expect(within(deleteProjectDialog).getByText(/Deletes this project from cloud storage/)).toBeVisible()
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

  it("saves a changed name on Enter or blur and ignores unchanged and empty names", async () => {
    const user = userEvent.setup()
    renderSettingsSheet()
    await user.click(screen.getByRole("button", { name: "Project settings" }))
    const name = screen.getByLabelText("Name")
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    await user.click(name)
    await user.tab()
    expect(storeState.renameActiveProject).not.toHaveBeenCalled()
    await user.clear(name)
    await user.tab()
    expect(name).toHaveValue("Alpha")
    expect(storeState.renameActiveProject).not.toHaveBeenCalled()
    await user.clear(name)
    await user.type(name, "  Beta  {Enter}")
    await user.tab()
    expect(storeState.renameActiveProject).toHaveBeenCalledTimes(1)
    expect(storeState.renameActiveProject).toHaveBeenCalledWith("Beta")
    await user.clear(name)
    await user.type(name, " Gamma ")
    await user.tab()
    expect(storeState.renameActiveProject).toHaveBeenLastCalledWith("Gamma")
  })

  it("saves the original name after an authoritative remote rename without duplicating Enter and blur", async () => {
    const user = userEvent.setup()
    const view = renderSettingsSheet()
    await user.click(screen.getByRole("button", { name: "Project settings" }))
    storeState.projects = storeState.projects!.map((project) => ({ ...project, name: "Beta" }))
    view.rerender(<TooltipProvider delayDuration={0}><SettingsSheet /></TooltipProvider>)
    const name = screen.getByLabelText("Name")
    await user.clear(name)
    await user.type(name, "Alpha{Enter}")
    await user.tab()
    expect(storeState.renameActiveProject).toHaveBeenCalledOnce()
    expect(storeState.renameActiveProject).toHaveBeenCalledWith("Alpha")
    expect(toast.success).toHaveBeenCalledOnce()
  })

  it("includes visible restore key action labels in their accessible names in every locale", () => {
    for (const catalog of Object.values(MESSAGES)) {
      for (const [label, name] of [
        ["project.show", "project.showRestoreKey"],
        ["project.hide", "project.hideRestoreKey"],
        ["project.copy", "project.copyRestoreKey"],
      ] as const) {
        expect(catalog[name].toLocaleLowerCase()).toContain(catalog[label].toLocaleLowerCase())
      }
    }
  })

  it("shows retry only for sync errors and expands spaces", async () => {
    const user = userEvent.setup()
    const view = renderSettingsSheet()
    await user.click(screen.getByRole("button", { name: "Project settings" }))
    expect(screen.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument()
    const spaces = screen.getByRole("button", { name: /Spaces/ })
    expect(spaces).toHaveAttribute("aria-expanded", "false")
    await user.click(spaces)
    expect(spaces).toHaveAttribute("aria-expanded", "true")
    storeState.lastSyncError = "Failed"
    view.rerender(
      <TooltipProvider>
        <SettingsSheet />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(storeState.syncToCloud).toHaveBeenCalledWith({ force: false })
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
