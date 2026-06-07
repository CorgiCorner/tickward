"use client"

import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AccountPreferencesProvider, useAccountPreferences } from "@/components/account-preferences-provider"
import { ApiKeysSettingsPanel, type ApiKeyRecord } from "@/components/api-keys-settings"
import { NotificationSettingsPanel } from "@/components/notification-settings"
import { TimerDefaultsSettingsPanel } from "@/components/timer-defaults-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AccountPreferencesRecord } from "@/lib/account-preferences"
import { authClient } from "@/lib/auth/auth-client"
import { authErrorMessage } from "@/lib/auth/auth-client-errors"
import { formatMessage } from "@/lib/i18n/messages"
import { useTimerStore } from "@/lib/store"
import { cn } from "@/lib/utils"

type AccountUser = {
  name?: string | null
  email?: string | null
}

const profileInputProps = {
  autoComplete: "name",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-nordpass-ignore": "true",
  "data-np-autofill": "false",
  "data-np-ignore": "true",
} as const

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

function cleanUserName(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const normalized = trimmed.toLowerCase().replaceAll(/\s+/g, " ")
  if (normalized === "undefined" || normalized === "undefined undefined" || normalized === "null null") return null

  return trimmed
}

function AccountLoadingPanel() {
  return <div className="rounded-lg border p-4 text-sm text-muted-foreground">{formatMessage("auth.loading")}</div>
}

function AccountSignInRequiredPanel() {
  return (
    <div className="grid gap-3 rounded-lg border p-4 text-sm">
      <p className="text-muted-foreground">{formatMessage("auth.signInRequiredDescription")}</p>
      <Button asChild className="w-fit">
        <Link href="/sign-in">
          <UserIcon className="size-4" />
          {formatMessage("auth.signIn")}
        </Link>
      </Button>
    </div>
  )
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
      await session.refetch?.()
      toast.success(formatMessage("auth.signedOut"))
    } catch (error) {
      toast.error(authErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/sign-in" aria-label={formatMessage("auth.signIn")}>
          <UserIcon className="size-4" />
          {formatMessage("auth.signIn")}
        </Link>
      </Button>
    )
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={formatMessage("auth.openMenu")}>
              <AccountAvatar user={user} className="size-6 text-[10px]" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          {formatMessage("auth.account")}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center gap-3 px-2 py-2">
          <AccountAvatar user={user} className="size-6 text-[10px]" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{displayName ?? formatMessage("auth.account")}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <Separator className="my-2" />
        <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
          <Link href="/settings">
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

function SignedInAccountPanel(
  props: Readonly<{
    loading: boolean
    onNameChange: (value: string) => void
    onNameCommit: () => void
    profileName: string
    user: AccountUser
  }>,
) {
  const displayName = cleanUserName(props.user.name)

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <AccountAvatar user={props.user} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{displayName ?? formatMessage("auth.account")}</div>
          <div className="break-all text-sm text-muted-foreground">{props.user.email}</div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="auth-name">{formatMessage("auth.name")}</Label>
        <Input
          id="auth-name"
          value={props.profileName}
          maxLength={80}
          disabled={props.loading}
          {...profileInputProps}
          onBlur={props.onNameCommit}
          onChange={(event) => props.onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          placeholder={formatMessage("auth.name.placeholder")}
        />
      </div>
    </div>
  )
}

function AccountPreferencesSections(
  props: Readonly<{
    apiKeys?: ApiKeyRecord[]
    apiKeysError?: string | null
  }>,
) {
  const { error, loading, refreshPreferences } = useAccountPreferences()

  return (
    <div className="grid gap-6">
      {error ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refreshPreferences()}
          >
            {formatMessage("apiKeys.retry")}
          </Button>
        </div>
      ) : null}
      <TimerDefaultsSettingsPanel />
      <NotificationSettingsPanel />
      <ApiKeysSettingsPanel initialApiKeys={props.apiKeys} initialLoadError={props.apiKeysError} />
    </div>
  )
}

const SETTINGS_SECTION_IDS = new Set(["profile", "defaults", "alerts", "api-keys"])

function normalizedSettingsHashId() {
  const raw = globalThis.location.hash.slice(1)
  if (!raw) return null

  try {
    const id = decodeURIComponent(raw.split("#")[0] ?? "").trim()
    return SETTINGS_SECTION_IDS.has(id) ? id : null
  } catch {
    return null
  }
}

function scrollToHashTarget() {
  const id = normalizedSettingsHashId()
  if (!id) return

  const hash = `#${encodeURIComponent(id)}`
  if (globalThis.location.hash !== hash) {
    globalThis.history.replaceState(null, "", `${globalThis.location.pathname}${globalThis.location.search}${hash}`)
  }
  globalThis.document.getElementById(id)?.scrollIntoView({ block: "start" })
}

function SettingsHashScroller() {
  useEffect(() => {
    const scroll = () => {
      const timeout = globalThis.setTimeout(scrollToHashTarget, 0)
      return () => globalThis.clearTimeout(timeout)
    }

    let cancelScroll = scroll()
    const onHashChange = () => {
      cancelScroll()
      cancelScroll = scroll()
    }

    globalThis.addEventListener("hashchange", onHashChange)
    return () => {
      cancelScroll()
      globalThis.removeEventListener("hashchange", onHashChange)
    }
  }, [])

  return null
}

export type AccountPageInitialData = {
  apiKeys?: ApiKeyRecord[]
  apiKeysError?: string | null
  preferences?: AccountPreferencesRecord
  preferencesError?: string | null
}

export function AccountPageClient(props: Readonly<AccountPageInitialData> = {}) {
  const session = authClient.useSession()
  const sessionPending = Boolean(session.isPending)

  const [nameDraft, setNameDraft] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const profileName = nameTouched ? nameDraft : (cleanUserName(session.data?.user?.name) ?? "")

  async function updateProfileName() {
    const nextName = profileName.trim()
    const savedName = cleanUserName(session.data?.user?.name) ?? ""
    if (!nextName || nextName === savedName || loading) {
      setNameDraft(savedName)
      setNameTouched(false)
      return
    }
    setLoading(true)
    try {
      const result = await authClient.updateUser({ name: nextName })
      if (result.error) throw result.error
      await session.refetch()
      setNameDraft(nextName)
      setNameTouched(false)
      toast.success(formatMessage("auth.profileSaved"))
    } catch (error) {
      toast.error(authErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  let content
  if (sessionPending) {
    content = <AccountLoadingPanel />
  } else if (session.data?.user) {
    content = (
      <section id="profile" className="grid scroll-mt-6 gap-4 rounded-lg border p-4">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">{formatMessage("auth.profile")}</h2>
          <p className="text-sm text-muted-foreground">{formatMessage("auth.profileDescription")}</p>
        </div>
        <SignedInAccountPanel
          loading={loading}
          profileName={profileName}
          user={session.data.user}
          onNameChange={(value) => {
            setNameDraft(value)
            setNameTouched(true)
          }}
          onNameCommit={() => void updateProfileName()}
        />
      </section>
    )
  } else {
    content = <AccountSignInRequiredPanel />
  }

  const descriptionKey = session.data?.user ? "auth.description.signedIn" : "auth.description.accountSignInRequired"

  return (
    <main className="mx-auto grid w-full max-w-[640px] gap-8 px-4 py-8">
      <SettingsHashScroller />
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">{formatMessage("auth.accountSettings")}</h1>
        <p className="text-sm text-muted-foreground">{formatMessage(descriptionKey)}</p>
      </div>

      {content}
      {session.data?.user ? (
        <AccountPreferencesProvider initialPreferences={props.preferences} initialError={props.preferencesError}>
          <AccountPreferencesSections apiKeys={props.apiKeys} apiKeysError={props.apiKeysError} />
        </AccountPreferencesProvider>
      ) : null}
    </main>
  )
}
