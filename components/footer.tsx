"use client"

import { useEffect, useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { cn } from "@/lib/utils"

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
  const [, setTick] = useState(0)

  // The "Synced {timeAgo}" label is derived from Date.now(), so force a
  // re-render every 30s to keep it from going stale while the tab idles.
  useEffect(() => {
    if (!lastSyncAt) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [lastSyncAt])

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const hasCloudAccess = Boolean(restoreKey || activeProject?.cloudProjectId)

  const label = syncStatusLabel({ hasCloudAccess, isSyncing, lastSyncError, lastSyncAt })
  const dotClass = syncStatusDotClass({ hasCloudAccess, isSyncing, lastSyncError })

  const status = (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={["inline-block size-1.5 shrink-0 rounded-full", dotClass].join(" ")} />
      <span className="truncate">{label}</span>
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
        "sticky bottom-0 z-30 border-t border-border bg-background/85 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80",
        props.className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[640px] min-w-0 items-center px-4 text-left">
        <SyncStatus />
      </div>
    </footer>
  )
}
