"use client"

import { MoonIcon, PlusIcon, SunIcon, TimerIcon } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { AccountButton } from "@/components/account-auth"
import { GitHubRepoButton } from "@/components/github-repo-button"
import { ProjectSwitcher } from "@/components/project-switcher"
import { TimerForm } from "@/components/timer-form"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { canCreateTimer, getEntitlements, timerLimitMessage, timerSpaceLimitMessage } from "@/lib/entitlements"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { timerLimitWarningMessage } from "@/lib/timer-limits"
import { activeTimerCountForTargetSpace, timerTargetSpaceId } from "@/lib/timer-space-limits"

function subscribeToHydrationStore() {
  return () => {}
}

function getHydratedSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

export function Header(props: Readonly<{ timerCount?: number; timerMax?: number }>) {
  const addTimer = useTimerStore((s) => s.addTimer)
  const timers = useTimerStore((s) => s.timers)
  const spaces = useTimerStore((s) => s.spaces)
  const { resolvedTheme, setTheme } = useTheme()
  const themeMounted = useSyncExternalStore(subscribeToHydrationStore, getHydratedSnapshot, getServerSnapshot)
  const isDark = themeMounted && resolvedTheme === "dark"

  const entitlements = getEntitlements()
  const timerMax = props.timerMax ?? entitlements.maxTimers
  const atLimit = (props.timerCount ?? 0) >= timerMax
  const limitMessage = timerLimitMessage({ ...entitlements, maxTimers: timerMax })

  const [timerFormOpen, setTimerFormOpen] = useState(false)

  function limitMessageForTimer(spaceId: string | undefined) {
    const effectiveEntitlements = { ...entitlements, maxTimers: timerMax }
    if (!canCreateTimer(timers.length, effectiveEntitlements)) return timerLimitMessage(effectiveEntitlements)
    const targetSpaceId = spaces.some((space) => space.id === spaceId) ? timerTargetSpaceId(spaceId) : undefined
    if (activeTimerCountForTargetSpace(timers, targetSpaceId) >= effectiveEntitlements.maxTimersPerSpace) {
      return timerSpaceLimitMessage(effectiveEntitlements)
    }
    return timerLimitMessage(effectiveEntitlements)
  }

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
          {atLimit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button variant="outline" size="icon" aria-label={formatMessage("header.addTimer")} disabled>
                    <PlusIcon className="size-5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[240px] text-center">
                {limitMessage}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={formatMessage("header.addTimer")}
                  onClick={() => setTimerFormOpen(true)}
                >
                  <PlusIcon className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                {formatMessage("header.addTimer")}
              </TooltipContent>
            </Tooltip>
          )}
          <TimerForm
            mode="create"
            open={timerFormOpen}
            onOpenChange={setTimerFormOpen}
            onSubmit={(t) => {
              const added = addTimer(t)
              if (!added) {
                toast.error(limitMessageForTimer(t.spaceId))
                return
              }
              toast.success(formatMessage("timer.created"))
              const warning = timerLimitWarningMessage(timers.length + 1, timerMax)
              if (warning) toast(warning, { id: "timer-limit-warn" })
            }}
          />
        </div>
      </div>
    </header>
  )
}
