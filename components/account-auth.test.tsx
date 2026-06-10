import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountButton, AccountPageClient } from "@/components/account-auth"
import { TooltipProvider } from "@/components/ui/tooltip"

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  removeAccountProjectsFromDevice: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: mocks.useSession,
    signOut: mocks.signOut,
    updateUser: mocks.updateUser,
  },
}))

vi.mock("@/components/account-preferences-provider", () => ({
  AccountPreferencesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAccountPreferences: () => ({
    error: null,
    loading: false,
    refreshPreferences: vi.fn(),
  }),
}))

vi.mock("@/components/api-keys-settings", () => ({
  ApiKeysSettingsPanel: () => <section id="api-keys">API keys</section>,
}))

vi.mock("@/components/mcp-settings", () => ({
  McpSettingsPanel: ({ remoteUrl }: { remoteUrl?: string | null }) => (
    <section id="mcp">MCP {remoteUrl ? "configured" : "not configured"}</section>
  ),
}))

vi.mock("@/components/webhooks-settings", () => ({
  WebhooksSettingsPanel: () => <section id="webhooks">Webhooks</section>,
}))

vi.mock("@/components/notification-settings", () => ({
  NotificationSettingsPanel: () => <section id="alerts">Alert settings</section>,
}))

vi.mock("@/components/timer-defaults-settings", () => ({
  TimerDefaultsSettingsPanel: () => <section id="defaults">Timer defaults</section>,
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

vi.mock("@/lib/store", () => ({
  useTimerStore: <T,>(selector: (store: { removeAccountProjectsFromDevice: () => void }) => T) =>
    selector({ removeAccountProjectsFromDevice: mocks.removeAccountProjectsFromDevice }),
}))

function renderWithTooltips(ui: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

describe("AccountButton", () => {
  beforeEach(() => {
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null })
    mocks.signOut.mockReset()
    mocks.signOut.mockResolvedValue({ data: {}, error: null })
    mocks.removeAccountProjectsFromDevice.mockReset()
    mocks.refetch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  it("links anonymous users to the sign-in route", () => {
    renderWithTooltips(<AccountButton />)

    const link = screen.getByRole("link", { name: "Sign in" })
    expect(link).toHaveAttribute("href", "/sign-in")
  })

  it("opens an account popover for signed-in users", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { name: "Ada Lovelace", email: "ada@example.com" } },
      refetch: mocks.refetch,
    })

    renderWithTooltips(<AccountButton />)

    const trigger = screen.getByRole("button", { name: "Open account menu" })
    expect(trigger).toHaveTextContent("AL")
    expect(trigger).not.toHaveTextContent("Account")

    await user.click(trigger)

    expect(screen.getAllByText("AL")).toHaveLength(2)
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings")
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible()
  })

  it("signs out from the account popover", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })

    renderWithTooltips(<AccountButton />)

    await user.click(screen.getByRole("button", { name: "Open account menu" }))
    await user.click(screen.getByRole("button", { name: "Sign out" }))

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
    expect(mocks.removeAccountProjectsFromDevice).toHaveBeenCalledTimes(1)
    expect(mocks.refetch).toHaveBeenCalled()
  })
})

describe("AccountPageClient", () => {
  beforeEach(() => {
    mocks.useSession.mockReset()
    mocks.useSession.mockReturnValue({ data: null, refetch: mocks.refetch })
    mocks.signOut.mockReset()
    mocks.signOut.mockResolvedValue({ data: {}, error: null })
    mocks.updateUser.mockReset()
    mocks.updateUser.mockResolvedValue({ data: { user: { name: "Ada Lovelace" } }, error: null })
    mocks.refetch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
    window.history.replaceState(null, "", "/")
  })

  it("points anonymous users to sign in instead of showing inline OTP", () => {
    render(<AccountPageClient />)

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in")
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument()
  })

  it("shows a neutral account loading state while the session is pending", () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true, refetch: mocks.refetch })
    render(<AccountPageClient />)

    expect(screen.getByText("Checking account...")).toBeVisible()
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument()
  })

  it("updates the signed-in user's profile name", async () => {
    const user = userEvent.setup()
    mocks.useSession.mockReturnValue({
      data: { user: { name: "Ada", email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient />)

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible()
    const name = screen.getByLabelText("Name")
    await user.clear(name)
    await user.type(name, "Ada Lovelace")
    await user.tab()

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ name: "Ada Lovelace" }))
    expect(mocks.refetch).toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Profile saved.")
  })

  it("treats provider placeholder names as missing profile names", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { name: "undefined undefined", email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient />)

    expect(screen.queryByText("undefined undefined")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("")
    expect(screen.getByText("ada@example.com")).toBeVisible()
  })

  it("keeps sign out out of account settings", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient />)

    expect(screen.getByText("ada@example.com")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument()
  })

  it("orders account sections from profile to MCP", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    render(<AccountPageClient mcpRemoteUrl="https://mcp.example.com/mcp" />)

    const profile = document.getElementById("profile")
    const defaults = document.getElementById("defaults")
    const alerts = document.getElementById("alerts")
    const apiKeys = document.getElementById("api-keys")
    const webhooks = document.getElementById("webhooks")
    const mcp = document.getElementById("mcp")

    expect(profile).not.toBeNull()
    expect(defaults).not.toBeNull()
    expect(alerts).not.toBeNull()
    expect(apiKeys).not.toBeNull()
    expect(webhooks).not.toBeNull()
    expect(mcp).not.toBeNull()
    expect(profile!.compareDocumentPosition(defaults!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(defaults!.compareDocumentPosition(alerts!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(alerts!.compareDocumentPosition(apiKeys!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(apiKeys!.compareDocumentPosition(webhooks!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(webhooks!.compareDocumentPosition(mcp!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText("MCP configured")).toBeVisible()
  })

  it("normalizes and scrolls to settings hash sections after render", async () => {
    const scrollIntoView = vi.fn()
    mocks.useSession.mockReturnValue({
      data: { user: { email: "ada@example.com" } },
      refetch: mocks.refetch,
    })
    window.history.replaceState(null, "", "/settings#alerts#alerts")
    Element.prototype.scrollIntoView = scrollIntoView

    render(<AccountPageClient />)

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }))
    expect(window.location.hash).toBe("#alerts")
  })
})
