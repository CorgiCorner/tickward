"use client"

import Link from "next/link"

import { GitHubRepoButton } from "@/components/github-repo-button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"

function formatTimeAgo(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return formatMessage("footer.justNow")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return formatMessage("footer.minutesAgo", { count: minutes })
  const hours = Math.floor(minutes / 60)
  return formatMessage("footer.hoursAgo", { count: hours })
}

function syncStatusLabel(args: { isSyncing: boolean; lastSyncError: string | null; lastSyncAt: string | null }) {
  if (args.isSyncing) return formatMessage("footer.syncing")
  if (args.lastSyncError) return formatMessage("footer.syncError")
  if (args.lastSyncAt) return formatMessage("footer.syncedAt", { timeAgo: formatTimeAgo(args.lastSyncAt) })
  return formatMessage("footer.synced")
}

function syncStatusDotClass(args: { isSyncing: boolean; lastSyncError: string | null }) {
  if (args.isSyncing) return "animate-pulse bg-blue-400"
  if (args.lastSyncError) return "bg-amber-500"
  return "bg-emerald-500"
}

function SyncStatus() {
  const restoreKey = useTimerStore((s) => s.restoreKey)
  const isSyncing = useTimerStore((s) => s.isSyncing)
  const lastSyncError = useTimerStore((s) => s.lastSyncError)
  const lastSyncAt = useTimerStore((s) => s.lastSyncAt)

  if (!restoreKey) return null

  const label = syncStatusLabel({ isSyncing, lastSyncError, lastSyncAt })
  const dotClass = syncStatusDotClass({ isSyncing, lastSyncError })

  const status = (
    <div className="flex items-center gap-1.5">
      <span className={["inline-block size-1.5 shrink-0 rounded-full", dotClass].join(" ")} />
      <span>{label}</span>
    </div>
  )

  if (!lastSyncError) return status

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]">
          {status}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-[260px] text-center">
        {lastSyncError}
      </TooltipContent>
    </Tooltip>
  )
}

type FooterProps = {
  docsHref?: string | null
  releaseTag: string
}

export function Footer({ docsHref, releaseTag }: Readonly<FooterProps>) {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-3 px-4 py-5 text-center text-xs text-muted-foreground">
        <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <GitHubRepoButton variant="compact" className="sm:hidden" />
          <SyncStatus />
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="underline decoration-dotted underline-offset-4 hover:text-foreground">
                {formatMessage("footer.inactivityPolicy")}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8} className="max-w-[260px] text-center">
              {formatMessage("footer.inactivityPolicyTooltip")}
            </TooltipContent>
          </Tooltip>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {docsHref ? (
              <Link className="hover:text-foreground" href={docsHref}>
                {formatMessage("footer.docs")}
              </Link>
            ) : null}
            <a className="hover:text-foreground" href="/sitemap.xml">
              {formatMessage("footer.sitemap")}
            </a>
            <a className="hover:text-foreground" href="/robots.txt">
              {formatMessage("footer.robots")}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2 leading-relaxed">
          <span>
            <span className="mr-1 font-medium text-foreground">tickward</span>© {year}
          </span>
          <span className="rounded-full border px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
            {releaseTag}
          </span>
        </div>
      </div>
    </footer>
  )
}
