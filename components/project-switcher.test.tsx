import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ProjectSwitcher } from "@/components/project-switcher"
import type { TimerStore } from "@/lib/store"

let storeState: Partial<TimerStore>
const settingsSheetMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/components/settings-sheet", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  const ReactDom = await vi.importActual<typeof import("react-dom")>("react-dom")

  return {
    SettingsSheet: (props: { className?: string; onTriggerClick?: () => void; showTriggerTooltip?: boolean }) => {
      const [open, setOpen] = React.useState(false)

      settingsSheetMock(props)
      return (
        <>
          <button
            type="button"
            className={props.className}
            onClick={() => {
              setOpen(true)
              props.onTriggerClick?.()
            }}
          >
            Project settings
          </button>
          {open
            ? ReactDom.createPortal(
                <div role="dialog" aria-label="Project settings">
                  Project settings drawer
                </div>,
                document.body,
              )
            : null}
        </>
      )
    },
  }
})

describe("ProjectSwitcher", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    settingsSheetMock.mockClear()
    storeState = {
      projects: [
        {
          id: "project-a",
          name: "Alpha",
          restoreKey: "restoreKey_123",
          createdAt: "2026-05-20T00:00:00.000Z",
          updatedAt: "2026-05-20T00:00:00.000Z",
          timerCount: 2,
        },
      ],
      activeProjectId: "project-a",
      restoreKey: "restoreKey_123",
      hasHydrated: true,
      isSyncing: false,
      isCheckingCloud: false,
      switchProject: vi.fn(),
      createProject: vi.fn(),
      restoreProjectFromCloud: vi.fn().mockResolvedValue(undefined),
    }
  })

  it("renders active project and available projects", async () => {
    const user = userEvent.setup()
    render(<ProjectSwitcher />)

    await user.click(screen.getByRole("button", { name: "Switch project" }))

    expect(screen.getAllByText("Alpha")).toHaveLength(3)
    expect(screen.getByText("Local")).toBeVisible()
    expect(screen.getByText("rest..._123")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument()
  })

  it("opens project settings from the active project header without switching projects", async () => {
    const user = userEvent.setup()
    render(<ProjectSwitcher />)

    await user.click(screen.getByRole("button", { name: "Switch project" }))
    await user.click(screen.getByRole("button", { name: "Project settings" }))

    expect(storeState.switchProject).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole("button", { name: /new project/i })).not.toBeInTheDocument())
  })

  it("keeps the project settings drawer open after the project menu closes", async () => {
    const user = userEvent.setup()
    render(<ProjectSwitcher />)

    await user.click(screen.getByRole("button", { name: "Switch project" }))
    await user.click(screen.getByRole("button", { name: "Project settings" }))

    await waitFor(() => expect(screen.queryByRole("button", { name: /new project/i })).not.toBeInTheDocument())
    expect(screen.getByRole("dialog", { name: "Project settings" })).toBeVisible()
  })

  it("does not show the settings tooltip when the project menu auto-focuses the settings trigger", async () => {
    const user = userEvent.setup()
    render(<ProjectSwitcher />)

    await user.click(screen.getByRole("button", { name: "Switch project" }))

    expect(settingsSheetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showTriggerTooltip: false,
      }),
    )
  })

  it("does not label account-backed projects as local", async () => {
    const user = userEvent.setup()
    storeState.projects = [
      {
        id: "project-a",
        name: "Alpha",
        restoreKey: "restoreKey_123",
        cloudProjectId: "project_123",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ]

    render(<ProjectSwitcher />)
    await user.click(screen.getByRole("button", { name: "Switch project" }))

    expect(screen.queryByText("Local")).not.toBeInTheDocument()
  })

  it("renders no fake project while the browser has no projects", () => {
    storeState.projects = []
    storeState.activeProjectId = null

    const { container } = render(<ProjectSwitcher />)

    expect(container).toBeEmptyDOMElement()
  })

  it("keeps short project names compact in the header trigger", () => {
    storeState.projects = [
      {
        id: "project-a",
        name: "main",
        restoreKey: "restoreKey_123",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
        timerCount: 2,
      },
    ]

    render(<ProjectSwitcher />)

    const trigger = screen.getByRole("button", { name: "Switch project" })
    expect(trigger).toHaveClass("project-switcher-trigger", "w-fit", "min-w-0", "overflow-hidden")
    expect(trigger).not.toHaveClass("w-full")
    expect(trigger).toHaveAttribute("title", "main")
  })

  it("truncates long project names in the mobile header trigger", () => {
    const longName = "A very long demo project name that should never push header actions outside the viewport"
    storeState.projects = [
      {
        id: "project-a",
        name: longName,
        restoreKey: "restoreKey_123",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
        timerCount: 2,
      },
    ]

    render(<ProjectSwitcher />)

    const trigger = screen.getByRole("button", { name: "Switch project" })
    expect(trigger).toHaveClass("project-switcher-trigger", "w-fit", "min-w-0", "overflow-hidden")
    expect(trigger).toHaveAttribute("title", longName)
    expect(within(trigger).getByText(longName)).toHaveClass("min-w-0", "flex-1", "truncate")
  })

  it("shows only one icon inside the restore button while loading", async () => {
    const user = userEvent.setup()
    let resolveRestore: () => void = () => {}
    storeState.restoreProjectFromCloud = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRestore = resolve
        }),
    )

    render(<ProjectSwitcher />)
    await user.click(screen.getByRole("button", { name: "Switch project" }))
    await user.type(screen.getByPlaceholderText("Restore key"), "restoreKey_456")

    const restoreButton = screen.getByRole("button", { name: "Restore project" })
    expect(restoreButton.querySelectorAll("svg")).toHaveLength(1)

    await user.click(restoreButton)

    await waitFor(() => expect(storeState.restoreProjectFromCloud).toHaveBeenCalledWith("restoreKey_456"))
    expect(restoreButton.querySelectorAll("svg")).toHaveLength(1)

    resolveRestore()
  })

  it("does not leak technical restore errors to users", async () => {
    const user = userEvent.setup()
    storeState.restoreProjectFromCloud = vi.fn().mockRejectedValue(new Error("raw restore token failed"))

    render(<ProjectSwitcher />)
    await user.click(screen.getByRole("button", { name: "Switch project" }))
    await user.type(screen.getByPlaceholderText("Restore key"), "restoreKey_456")
    await user.click(screen.getByRole("button", { name: "Restore project" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Restore failed."))
    expect(toast.error).not.toHaveBeenCalledWith("raw restore token failed")
  })
})
