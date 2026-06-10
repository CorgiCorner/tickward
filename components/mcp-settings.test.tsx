import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { McpSettingsPanel } from "@/components/mcp-settings"

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast }))

describe("McpSettingsPanel", () => {
  it("shows an unconfigured state until a remote endpoint is provided", () => {
    render(<McpSettingsPanel />)

    expect(screen.getByRole("heading", { name: "MCP" })).toBeVisible()
    expect(screen.getByText("Remote MCP is not configured for this deployment.")).toBeVisible()
  })

  it("copies the configured remote endpoint", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    render(<McpSettingsPanel remoteUrl="https://mcp.example.com/mcp" />)

    await user.click(screen.getByRole("button", { name: "Copy remote MCP URL" }))

    expect(writeText).toHaveBeenCalledWith("https://mcp.example.com/mcp")
    expect(toast.success).toHaveBeenCalledWith("Copied.")
  })

  it("links to the MCP setup guide", () => {
    render(<McpSettingsPanel docsHref="/docs/guides/mcp" />)

    expect(screen.getByRole("link", { name: "Guide" })).toHaveAttribute("href", "/docs/guides/mcp")
    expect(screen.getByRole("link", { name: "Guide" })).toHaveAttribute("target", "_blank")
  })

  it("shows authorized MCP connections", () => {
    render(
      <McpSettingsPanel
        initialConnections={[
          {
            client_name: "Claude Code",
            created_at: "2026-06-07T22:42:00.000Z",
            id: "connection_123",
            key_last4: "last",
            key_prefix: "tw_mcp_abc123",
            last_used_at: null,
            name: "MCP: Claude Code",
            object: "mcp_connection",
            permission: "read",
            revoked_at: null,
            scopes: ["projects:read"],
            updated_at: "2026-06-07T22:42:00.000Z",
          },
        ]}
      />,
    )

    expect(screen.getByText("Authorized connections")).toBeVisible()
    expect(screen.getByText("Claude Code")).toBeVisible()
    expect(screen.getByText("tw_mcp_abc123...last")).toBeVisible()
  })

  it("shows mixed OAuth write scopes as scoped access", () => {
    render(
      <McpSettingsPanel
        initialConnections={[
          {
            client_name: "ChatGPT",
            created_at: "2026-06-07T22:42:00.000Z",
            id: "connection_123",
            key_last4: "last",
            key_prefix: "tw_mcp_abc123",
            last_used_at: null,
            name: "MCP: ChatGPT",
            object: "mcp_connection",
            permission: "full_access",
            revoked_at: null,
            scopes: ["projects:read", "timers:write"],
            updated_at: "2026-06-07T22:42:00.000Z",
          },
        ]}
      />,
    )

    expect(screen.getByText("Scoped write")).toBeVisible()
    expect(screen.queryByText("Full access")).not.toBeInTheDocument()
    expect(screen.getByText("projects read")).toBeVisible()
    expect(screen.getByText("timers write")).toBeVisible()
  })

  it("requires confirmation before revoking a connection", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        deleted: true,
        id: "connection_123",
        object: "mcp_connection",
      }),
    )

    render(
      <McpSettingsPanel
        initialConnections={[
          {
            client_name: "ChatGPT",
            created_at: "2026-06-07T22:42:00.000Z",
            id: "connection_123",
            key_last4: "last",
            key_prefix: "tw_mcp_abc123",
            last_used_at: null,
            name: "MCP: ChatGPT",
            object: "mcp_connection",
            permission: "full_access",
            revoked_at: null,
            scopes: ["projects:read"],
            updated_at: "2026-06-07T22:42:00.000Z",
          },
        ]}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Revoke" }))

    expect(screen.getByRole("alertdialog")).toHaveTextContent("Revoke this MCP connection?")
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Revoke" }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/account/mcp-connections/connection_123", { method: "DELETE" }),
    )
    expect(toast.success).toHaveBeenCalledWith("MCP connection revoked.")
  })
})
