"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { authClient } from "@/lib/auth/auth-client"
import { readApiJson } from "@/lib/client-api"

export type InboxItem = {
  id: string
  type: string
  timer_id: string | null
  project_id: string | null
  payload: unknown
  read_at: string | null
  created_at: string
}

type InboxResponse = {
  object: "list"
  items: InboxItem[]
  unread_count: number
  next_cursor: string | null
}

function isInboxResponse(value: unknown): value is InboxResponse {
  if (!value || typeof value !== "object") return false
  const record = value as Partial<InboxResponse>
  return record.object === "list" && Array.isArray(record.items) && typeof record.unread_count === "number"
}

async function readInboxResponse(res: Response): Promise<InboxResponse | null> {
  const data = await readApiJson<unknown>(res, "").catch(() => null)
  return isInboxResponse(data) ? data : null
}

export function useInbox() {
  const session = authClient.useSession()
  const signedIn = Boolean(session.data?.user)
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const refreshInFlight = useRef(false)
  const refreshQueued = useRef(false)

  const refresh = useCallback(async () => {
    if (!signedIn) return
    // Focus and interval triggers can overlap; a stale response settling last
    // would clobber fresher list state and optimistic read markers. Instead of
    // dropping the newer trigger, queue it to run after the current request,
    // and time the request out so a hung fetch can't wedge the guard.
    if (refreshInFlight.current) {
      refreshQueued.current = true
      return
    }
    refreshInFlight.current = true
    setLoading(true)
    try {
      do {
        refreshQueued.current = false
        try {
          const res = await fetch("/api/account/notifications", {
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
          })
          const data = await readInboxResponse(res)
          if (data) {
            setItems(data.items)
            setNextCursor(data.next_cursor)
            setUnreadCount(data.unread_count)
          }
        } catch {
          // Timeout or network failure: keep current state; the next focus or
          // interval trigger retries.
        }
      } while (refreshQueued.current)
    } finally {
      refreshInFlight.current = false
      setLoading(false)
    }
  }, [signedIn])

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!signedIn || ids.length === 0) return
      const uniqueIds = [...new Set(ids)]
      const res = await fetch("/api/account/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds }),
      })
      const data = await readApiJson<{ unread_count?: unknown }>(res, "").catch(() => null)
      if (typeof data?.unread_count !== "number") return

      const readAt = new Date().toISOString()
      setUnreadCount(data.unread_count)
      setItems((current) =>
        current.map((item) => (uniqueIds.includes(item.id) ? { ...item, read_at: item.read_at ?? readAt } : item)),
      )
    },
    [signedIn],
  )

  const markAllRead = useCallback(async () => {
    if (!signedIn) return
    const res = await fetch("/api/account/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    const data = await readApiJson<{ unread_count?: unknown }>(res, "").catch(() => null)
    if (typeof data?.unread_count !== "number") return

    const readAt = new Date().toISOString()
    setUnreadCount(data.unread_count)
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })))
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      setItems([])
      setNextCursor(null)
      setUnreadCount(0)
      setLoading(false)
      return
    }

    void refresh()
    const onFocus = () => void refresh()
    globalThis.addEventListener("focus", onFocus)
    const id = globalThis.setInterval(() => void refresh(), 90_000)
    return () => {
      globalThis.removeEventListener("focus", onFocus)
      globalThis.clearInterval(id)
    }
  }, [refresh, signedIn])

  return { items, loading, markAllRead, markRead, nextCursor, signedIn, unreadCount }
}
