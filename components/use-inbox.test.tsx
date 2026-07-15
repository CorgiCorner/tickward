import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useInbox } from "@/components/use-inbox"

let sessionState: {
  data: { user: { id: string } } | null
  isPending: boolean
  refetch: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => sessionState,
  },
}))

describe("useInbox", () => {
  beforeEach(() => {
    sessionState = {
      data: { user: { id: "user_123" } },
      isPending: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    }
    vi.stubGlobal("fetch", vi.fn())
  })

  it("loads inbox items while the session is honored", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ object: "list", items: [], unread_count: 3, next_cursor: null }))

    const { result } = renderHook(() => useInbox())

    await waitFor(() => expect(result.current.unreadCount).toBe(3))
    expect(sessionState.refetch).not.toHaveBeenCalled()
  })

  it("refetches the session and stops the poll cycle when the server answers 401", async () => {
    // A session signed out in another tab leaves this tab's client session
    // stale-truthy; the server rejecting the poll is the reconciliation signal.
    vi.mocked(fetch).mockResolvedValue(new Response("Unauthorized", { status: 401 }))

    const { result } = renderHook(() => useInbox())

    await waitFor(() => expect(sessionState.refetch).toHaveBeenCalledTimes(1))
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(result.current.unreadCount).toBe(0)
  })
})
