import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PROJECT_CLAIM_TOAST_DELAY_MS, ProjectClaimSlot, ProjectClaimToast } from "@/components/project-claim-slot"
import type { TimerStore } from "@/lib/store"

let storeState: Partial<TimerStore>

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  toastCustom: vi.fn(),
  toastDismiss: vi.fn(),
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
    custom: mocks.toastCustom,
    dismiss: mocks.toastDismiss,
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
    mocks.toastCustom.mockReset()
    mocks.toastDismiss.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  it("renders nothing without project access", () => {
    render(
      <ProjectClaimSlot claimActiveProject={storeState.claimActiveProject!} restoreKey={null} projectName="Alpha" />,
    )

    expect(screen.queryByText("Save to account")).not.toBeInTheDocument()
  })

  it("shows claimed account state for account-backed projects", () => {
    render(
      <ProjectClaimSlot
        claimActiveProject={storeState.claimActiveProject!}
        restoreKey="restoreKey_123"
        projectName="Alpha"
        cloudProjectId="project_123"
      />,
    )

    expect(screen.getByText("This project is saved to your account.")).toBeVisible()
  })

  it("asks anonymous visitors to sign in first", () => {
    render(
      <ProjectClaimSlot
        claimActiveProject={storeState.claimActiveProject!}
        restoreKey="restoreKey_123"
        projectName="Alpha"
      />,
    )

    expect(screen.getByText("Sign in, then save this project from project settings.")).toBeVisible()
  })

  it("shows auth unavailable when account sign-in is not configured", () => {
    mocks.useSession.mockReturnValue({ data: null, error: { status: 501 } })

    render(
      <ProjectClaimSlot
        claimActiveProject={storeState.claimActiveProject!}
        restoreKey="restoreKey_123"
        projectName="Alpha"
      />,
    )

    expect(screen.getByText("Account sign-in is not configured.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Save to account" })).not.toBeInTheDocument()
  })

  it("shows a neutral account loading state while the session is pending", () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true })

    render(
      <ProjectClaimSlot
        claimActiveProject={storeState.claimActiveProject!}
        restoreKey="restoreKey_123"
        projectName="Alpha"
      />,
    )

    expect(screen.getByText("Checking account...")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Save to account" })).not.toBeInTheDocument()
  })

  it("claims the active project for signed-in users", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } } })
    render(
      <ProjectClaimSlot
        claimActiveProject={storeState.claimActiveProject!}
        restoreKey="restoreKey_123"
        projectName="Alpha"
      />,
    )

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
    render(
      <ProjectClaimSlot
        claimActiveProject={storeState.claimActiveProject!}
        restoreKey="restoreKey_123"
        projectName="Alpha"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Save to account" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Project claim failed."))
    expect(mocks.toastError).not.toHaveBeenCalledWith("internal database failure")
  })

  it("waits until the project has a timer before showing the claim toast", () => {
    vi.useFakeTimers()
    mocks.useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } } })

    const { rerender } = render(
      <ProjectClaimToast projectId="project-a" projectName="Alpha" restoreKey="restoreKey_123" timerCount={0} />,
    )

    act(() => vi.advanceTimersByTime(PROJECT_CLAIM_TOAST_DELAY_MS))
    expect(mocks.toastCustom).not.toHaveBeenCalled()

    rerender(<ProjectClaimToast projectId="project-a" projectName="Alpha" restoreKey="restoreKey_123" timerCount={1} />)

    act(() => vi.advanceTimersByTime(PROJECT_CLAIM_TOAST_DELAY_MS - 1))
    expect(mocks.toastCustom).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(mocks.toastCustom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        duration: Infinity,
        id: "project-claim:project-a",
        position: "bottom-right",
      }),
    )
  })

  it("keeps the claim action functional inside the toast", async () => {
    vi.useFakeTimers()
    mocks.useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } } })

    render(<ProjectClaimToast projectId="project-a" projectName="Alpha" restoreKey="restoreKey_123" timerCount={1} />)
    act(() => vi.advanceTimersByTime(PROJECT_CLAIM_TOAST_DELAY_MS))
    vi.useRealTimers()

    // Sonner passes the toast's own id to the render callback; the toast is
    // created with the deterministic id "project-claim:<projectId>".
    const renderToast = mocks.toastCustom.mock.calls[0][0]
    render(renderToast("project-claim:project-a"))

    fireEvent.click(screen.getByRole("button", { name: "Save to account" }))

    await waitFor(() => expect(storeState.claimActiveProject).toHaveBeenCalled())
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Project saved to your account.")
    expect(mocks.toastDismiss).toHaveBeenCalledWith("project-claim:project-a")
  })

  it("persists claim toast dismissal for the current browser session", () => {
    vi.useFakeTimers()
    mocks.useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } } })

    const { unmount } = render(
      <ProjectClaimToast projectId="project-a" projectName="Alpha" restoreKey="restoreKey_123" timerCount={1} />,
    )
    act(() => vi.advanceTimersByTime(PROJECT_CLAIM_TOAST_DELAY_MS))

    const renderToast = mocks.toastCustom.mock.calls[0][0]
    render(renderToast("project-claim:project-a"))
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(mocks.toastDismiss).toHaveBeenCalledWith("project-claim:project-a")

    unmount()
    mocks.toastCustom.mockClear()

    render(<ProjectClaimToast projectId="project-a" projectName="Alpha" restoreKey="restoreKey_123" timerCount={1} />)
    act(() => vi.advanceTimersByTime(PROJECT_CLAIM_TOAST_DELAY_MS))

    expect(mocks.toastCustom).not.toHaveBeenCalled()
  })
})
