"use client"

import { LogOutIcon, SettingsIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { SignInDialog } from "@/components/sign-in-auth"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLocale } from "@/components/locale-provider"
import { authClient } from "@/lib/auth/auth-client"
import { authErrorMessage } from "@/lib/auth/auth-client-errors"
import { formatMessage, localeHref } from "@/lib/i18n/messages"
import { setLocalInAppNotificationsEnabled } from "@/lib/local-notification-preferences.client"
import { useTimerStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export type AccountUser = {
  name?: string | null
  email?: string | null
}

function userInitials(user: AccountUser | null | undefined) {
  const nameSource = cleanUserName(user?.name)
  const emailSource = user?.email?.split("@")[0]
  const source = nameSource && nameSource.length > 0 ? nameSource : (emailSource ?? "?")
  const parts = source
    .replaceAll(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2)
  return initials.toUpperCase()
}

export function cleanUserName(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const normalized = trimmed.toLowerCase().replaceAll(/\s+/g, " ")
  if (normalized === "undefined" || normalized === "undefined undefined" || normalized === "null null") return null

  return trimmed
}

export function AccountAvatar(props: Readonly<{ className?: string; user: AccountUser }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border bg-muted text-[11px] font-semibold text-muted-foreground",
        props.className,
      )}
    >
      {userInitials(props.user)}
    </span>
  )
}

export function AccountButton() {
  const locale = useLocale()
  const session = authClient.useSession()
  const removeAccountProjectsFromDevice = useTimerStore((s) => s.removeAccountProjectsFromDevice)
  const user = session.data?.user
  const displayName = cleanUserName(user?.name)
  const [loading, setLoading] = useState(false)

  async function signOut() {
    setLoading(true)
    try {
      const result = await authClient.signOut()
      if (result.error) throw result.error
      removeAccountProjectsFromDevice()
      // The account master toggle mirrors into device storage; without an
      // account the default is ON, so drop any stale suppression on sign-out.
      setLocalInAppNotificationsEnabled(true)
      await session.refetch?.()
      toast.success(formatMessage("auth.signedOut"))
    } catch (error) {
      toast.error(authErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return <SignInDialog onCompleted={() => void session.refetch?.()} />
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={formatMessage("auth.openMenu")}>
              <AccountAvatar user={user} className="size-7 text-[11px]" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          {formatMessage("auth.account")}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center gap-3 px-2 py-2">
          <AccountAvatar user={user} className="size-7 text-[11px]" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{displayName ?? formatMessage("auth.account")}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <Separator className="my-2" />
        <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
          <Link href={localeHref(locale, "/settings")}>
            <SettingsIcon className="size-4" />
            {formatMessage("auth.accountSettings")}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          loading={loading}
          onClick={() => void signOut()}
        >
          {!loading && <LogOutIcon className="size-4" />}
          {formatMessage("auth.signOut")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
