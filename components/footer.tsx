"use client"

import { WifiOffIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { authClient } from "@/lib/auth/auth-client"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { cn } from "@/lib/utils"

// Tracks the browser's connectivity. Tickward keeps working offline because state
// is stored locally; this only drives the visible indicator.
function useOnlineStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(globalThis.navigator?.onLine ?? true)
    update()
    globalThis.addEventListener("online", update)
    globalThis.addEventListener("offline", update)
    return () => {
      globalThis.removeEventListener("online", update)
      globalThis.removeEventListener("offline", update)
    }
  }, [])

  return online
}

function OfflineBadge() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <WifiOffIcon className="size-3" />
      {formatMessage("footer.offline")}
    </span>
  )
}

function formatTimeAgo(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return formatMessage("footer.justNow")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return formatMessage("footer.minutesAgo", { count: minutes })
  const hours = Math.floor(minutes / 60)
  return formatMessage("footer.hoursAgo", { count: hours })
}

function syncStatusLabel(args: {
  hasCloudAccess: boolean
  isSyncing: boolean
  lastSyncError: string | null
  lastSyncAt: string | null
}) {
  if (!args.hasCloudAccess) return formatMessage("footer.localOnly")
  if (args.isSyncing) return formatMessage("footer.syncing")
  if (args.lastSyncError) return formatMessage("footer.syncError")
  if (args.lastSyncAt) return formatMessage("footer.syncedAt", { timeAgo: formatTimeAgo(args.lastSyncAt) })
  return formatMessage("footer.synced")
}

function syncStatusDotClass(args: { hasCloudAccess: boolean; isSyncing: boolean; lastSyncError: string | null }) {
  if (!args.hasCloudAccess) return "bg-muted-foreground"
  if (args.isSyncing) return "animate-pulse bg-blue-400"
  if (args.lastSyncError) return "bg-amber-500"
  return "bg-emerald-500"
}

function SyncStatus() {
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const projects = useTimerStore((s) => s.projects)
  const activeProjectId = useTimerStore((s) => s.activeProjectId)
  const isSyncing = useTimerStore((s) => s.isSyncing)
  const lastSyncError = useTimerStore((s) => s.lastSyncError)
  const lastSyncAt = useTimerStore((s) => s.lastSyncAt)
  const session = authClient.useSession()
  const [, setTick] = useState(0)
  // The signed-in state resolves only on the client, so gate session-dependent
  // copy until after mount to keep SSR and the first client render identical
  // (otherwise React reports a hydration mismatch).
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot client-mount flag to avoid an SSR/client hydration mismatch
  useEffect(() => setMounted(true), [])

  // The "Synced {timeAgo}" label is derived from Date.now(), so force a
  // re-render every 30s to keep it from going stale while the tab idles.
  useEffect(() => {
    if (!lastSyncAt) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [lastSyncAt])

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const hasCloudAccess = Boolean(restoreKey || activeProject?.cloudProjectId)
  // Synced through a restore key but never claimed by a signed-in account, so the
  // "Synced" label needs a hint that this project is not tied to an account yet.
  const isAnonymousCloud = hasCloudAccess && !activeProject?.cloudProjectId

  const label = syncStatusLabel({ hasCloudAccess, isSyncing, lastSyncError, lastSyncAt })
  const dotClass = syncStatusDotClass({ hasCloudAccess, isSyncing, lastSyncError })
  const suffixParts = []
  // Only hint "no account" when the visitor is genuinely signed out — a signed-in
  // user whose project is not yet cloud-claimed should not be told they have none.
  if (mounted && !session.isPending && !session.data?.user && !activeProject?.cloudProjectId) {
    suffixParts.push(formatMessage("footer.noAccount"))
  }
  if (!hasCloudAccess || isAnonymousCloud) suffixParts.push(formatMessage("footer.savedOnDevice"))

  const status = (
    <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span className={["inline-block size-1.5 shrink-0 rounded-full", dotClass].join(" ")} />
      <span className="truncate">{label}</span>
      {suffixParts.length > 0 && !isSyncing && !lastSyncError ? (
        <span className="shrink-0 text-muted-foreground/70">· {suffixParts.join(" · ")}</span>
      ) : null}
    </div>
  )

  if (!lastSyncError) return status

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="min-w-0 max-w-full text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          {status}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" sideOffset={8} className="w-auto max-w-[260px] px-3 py-1.5 text-center text-xs">
        {lastSyncError}
      </PopoverContent>
    </Popover>
  )
}

type FooterStatusBarProps = {
  className?: string
}

export function FooterStatusBar(props: Readonly<FooterStatusBarProps>) {
  return (
    <footer
      className={cn(
        // Safe-area padding is only applied in standalone/PWA mode. In a mobile
        // browser, `env(safe-area-inset-bottom)` flips as the bottom toolbar
        // shows/hides while scrolling, which made the sticky footer jump in height.
        "sticky bottom-0 z-30 border-t border-border bg-card py-2.5 [@media(display-mode:standalone)]:pb-[calc(0.625rem+env(safe-area-inset-bottom))] text-xs text-muted-foreground",
        props.className,
      )}
    >
      <div className="mx-auto flex min-h-5 w-full max-w-[640px] min-w-0 items-center gap-2 px-4 text-left">
        <OfflineBadge />
        <SyncStatus />
      </div>
    </footer>
  )
}
