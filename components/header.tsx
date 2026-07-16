"use client"

import { MoonIcon, SunIcon, TimerIcon } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { AccountButton } from "@/components/account-button"
import { CountUpNotificationRouter } from "@/components/count-up-indicator"
import { GitHubRepoButton } from "@/components/github-repo-button"
import { NotificationBell } from "@/components/notification-bell"
import { ProjectSwitcher } from "@/components/project-switcher"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage } from "@/lib/i18n/messages"

function subscribeToHydrationStore() {
  return () => {}
}

function getHydratedSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

export function Header() {
  const { resolvedTheme, setTheme } = useTheme()
  const themeMounted = useSyncExternalStore(subscribeToHydrationStore, getHydratedSnapshot, getServerSnapshot)
  const isDark = themeMounted && resolvedTheme === "dark"

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center gap-2.5 px-4 py-3">
        <div className="min-w-0 shrink-0">
          <Link
            href="/"
            aria-label={formatMessage("header.goHome")}
            className="flex items-center gap-1 truncate text-sm font-semibold tracking-tight"
          >
            <TimerIcon className="size-4 shrink-0" strokeWidth={2.5} />
            tickward
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <ProjectSwitcher />
        </div>

        <CountUpNotificationRouter />

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <GitHubRepoButton variant="compact" className="hidden sm:inline-flex" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={formatMessage("header.toggleTheme")}
                className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              {formatMessage("header.toggleTheme")}
            </TooltipContent>
          </Tooltip>

          <NotificationBell />

          <AccountButton />
        </div>
      </div>
    </header>
  )
}
