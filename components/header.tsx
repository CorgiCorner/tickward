"use client"

import { MoonIcon, SunIcon, TimerIcon } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { AccountButton } from "@/components/account-auth"
import { GitHubRepoButton } from "@/components/github-repo-button"
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
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-2 px-4 py-3">
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

        <div className="ml-2 min-w-0 flex-1">
          <ProjectSwitcher />
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <GitHubRepoButton />

          <AccountButton />

          {/* Theme toggle — desktop only (mobile: in settings) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={formatMessage("header.toggleTheme")}
                className="hidden md:inline-flex"
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              {formatMessage("header.toggleTheme")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
