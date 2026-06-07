import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ProjectClaimSlot } from "@/components/project-claim-slot"
import type { TimerStore } from "@/lib/store"

let storeState: Partial<TimerStore>

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: mocks.useSession,
  },
}))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: TimerStore) => T) => selector(storeState as TimerStore),
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

vi.mock("@/lib/client-errors", () => ({
  logClientError: vi.fn(),
}))

describe("ProjectClaimSlot", () => {
  beforeEach(() => {
    storeState = {
      claimActiveProject: vi.fn().mockResolvedValue("claimed"),
    }
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null })
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  it("renders nothing without project access", () => {
    render(<ProjectClaimSlot restoreKey={null} projectName="Alpha" />)

    expect(screen.queryByText("Save to account")).not.toBeInTheDocument()
  })

  it("shows claimed account state for account-backed projects", () => {
    render(<ProjectClaimSlot restoreKey="restoreKey_123" projectName="Alpha" cloudProjectId="project_123" />)

    expect(screen.getByText("This project is saved to your account.")).toBeVisible()
  })

  it("asks anonymous visitors to sign in first", () => {
    render(<ProjectClaimSlot restoreKey="restoreKey_123" projectName="Alpha" />)

    expect(screen.getByText("Sign in, then save this project from project settings.")).toBeVisible()
  })

  it("shows auth unavailable when account sign-in is not configured", () => {
    mocks.useSession.mockReturnValue({ data: null, error: { status: 501 } })

    render(<ProjectClaimSlot restoreKey="restoreKey_123" projectName="Alpha" />)

    expect(screen.getByText("Account sign-in is not configured.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Save to account" })).not.toBeInTheDocument()
  })

  it("shows a neutral account loading state while the session is pending", () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true })

    render(<ProjectClaimSlot restoreKey="restoreKey_123" projectName="Alpha" />)

    expect(screen.getByText("Checking account...")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Save to account" })).not.toBeInTheDocument()
  })

  it("claims the active project for signed-in users", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } } })
    render(<ProjectClaimSlot restoreKey="restoreKey_123" projectName="Alpha" />)

    expect(screen.getByText("Keep this project with your account")).toBeVisible()
    expect(screen.getByText("Save Alpha to your account when you want it available after sign-in.")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Save to account" }))

    await waitFor(() => expect(storeState.claimActiveProject).toHaveBeenCalled())
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Project saved to your account.")
  })

  it("shows a safe error when claiming fails unexpectedly", async () => {
    const user = userEvent.setup()
    storeState.claimActiveProject = vi.fn().mockRejectedValue(new Error("internal database failure"))
    mocks.useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } } })
    render(<ProjectClaimSlot restoreKey="restoreKey_123" projectName="Alpha" />)

    await user.click(screen.getByRole("button", { name: "Save to account" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Project claim failed."))
    expect(mocks.toastError).not.toHaveBeenCalledWith("internal database failure")
  })
})
