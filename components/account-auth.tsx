"use client"

import { LogOutIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { lazy, Suspense, useEffect, useState } from "react"
import { toast } from "sonner"

import { AccountAvatar, cleanUserName, type AccountUser, useAccountSignOut } from "@/components/account-button"
import { AccountPreferencesProvider, useAccountPreferences } from "@/components/account-preferences-provider"
import type { ApiKeyRecord } from "@/components/api-keys-settings"
import { DefaultTimezoneSettingsRow } from "@/components/timer-defaults-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useLocale } from "@/components/locale-provider"
import type { AccountPreferencesRecord } from "@/lib/account-preferences"
import { authClient } from "@/lib/auth/auth-client"
import { authErrorMessage } from "@/lib/auth/auth-client-errors"
import { runInBackground } from "@/lib/background-task"
import { formatMessage, localeHref } from "@/lib/i18n/messages"
import type { McpConnectionPublicRecord } from "@/lib/mcp-oauth"
import type { WebhookEndpointPublicRecord } from "@/lib/webhook-events"

export { AccountButton, AccountAvatar } from "@/components/account-button"

const profileInputProps = {
  autoComplete: "name",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-nordpass-ignore": "true",
  "data-np-autofill": "false",
  "data-np-ignore": "true",
} as const

function SettingsPanelLoading(props: Readonly<{ id: string }>) {
  return (
    <div id={props.id} className="grid gap-3 py-4" aria-busy="true">
      <Skeleton className="h-4 w-32 rounded-md" />
      <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  )
}

const NotificationSettingsPanel = lazy(() =>
  import("@/components/notification-settings").then((mod) => ({ default: mod.NotificationSettingsPanel })),
)

const CountUpPolicySettings = lazy(() =>
  import("@/components/count-up-policy-settings").then((mod) => ({ default: mod.CountUpPolicySettings })),
)

const ApiKeysSettingsPanel = lazy(() =>
  import("@/components/api-keys-settings").then((mod) => ({ default: mod.ApiKeysSettingsPanel })),
)

const WebhooksSettingsPanel = lazy(() =>
  import("@/components/webhooks-settings").then((mod) => ({ default: mod.WebhooksSettingsPanel })),
)

const McpSettingsPanel = lazy(() =>
  import("@/components/mcp-settings").then((mod) => ({ default: mod.McpSettingsPanel })),
)

function AccountLoadingPanel() {
  return <div className="py-4 text-sm text-muted-foreground">{formatMessage("auth.loading")}</div>
}

function AccountSignInRequiredPanel() {
  const locale = useLocale()

  return (
    <div className="grid gap-3 py-4 text-sm">
      <p className="text-muted-foreground">{formatMessage("auth.signInRequiredDescription")}</p>
      <Button asChild className="w-fit">
        <Link href={localeHref(locale, "/sign-in")}>
          <UserIcon className="size-4" />
          {formatMessage("auth.signIn")}
        </Link>
      </Button>
    </div>
  )
}

function SignedInAccountPanel(
  props: Readonly<{
    loading: boolean
    onNameChange: (value: string) => void
    onNameCommit: () => void
    onSignOut: () => void
    profileName: string
    signOutLoading: boolean
    user: AccountUser
  }>,
) {
  const displayName = cleanUserName(props.user.name)

  return (
    <div className="mt-2 divide-y divide-border">
      <div id="profile" className="flex scroll-mt-28 items-center gap-3 py-4">
        <AccountAvatar user={props.user} className="size-9 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{displayName ?? formatMessage("auth.account")}</div>
          {props.user.email ? <div className="break-all text-xs text-muted-foreground">{props.user.email}</div> : null}
          <div className="text-xs text-muted-foreground">{formatMessage("settings.accountSignedInSynced")}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 text-xs text-muted-foreground"
          loading={props.signOutLoading}
          onClick={props.onSignOut}
        >
          {!props.signOutLoading ? <LogOutIcon className="size-3.5" /> : null}
          {formatMessage("auth.signOut")}
        </Button>
      </div>

      <div className="flex items-center gap-3 py-4">
        <div className="min-w-0 flex-1">
          <Label htmlFor="auth-name" className="text-sm font-medium">
            {formatMessage("auth.name")}
          </Label>
          <p className="text-xs text-muted-foreground">{formatMessage("settings.accountNameDescription")}</p>
        </div>
        <Input
          id="auth-name"
          value={props.profileName}
          maxLength={80}
          disabled={props.loading}
          className="h-8 w-44"
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
      <DefaultTimezoneSettingsRow />
    </div>
  )
}

function AccountPreferencesSections(
  props: Readonly<{
    apiKeys?: ApiKeyRecord[]
    apiKeysError?: string | null
    mcpConnections?: McpConnectionPublicRecord[]
    mcpConnectionsError?: string | null
    mcpDocsHref?: string | null
    mcpRemoteUrl?: string | null
    webhooksDocsHref?: string | null
    webhooks?: WebhookEndpointPublicRecord[]
    webhooksError?: string | null
  }>,
) {
  const { dismissError, error, loading, refreshPreferences } = useAccountPreferences()

  return (
    <div className="grid gap-10">
      {error ? (
        <div
          aria-live="polite"
          className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{error}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => runInBackground("accountPreferences.refresh", refreshPreferences())}
            >
              {formatMessage("apiKeys.retry")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismissError}>
              {formatMessage("common.close")}
            </Button>
          </div>
        </div>
      ) : null}
      <Suspense fallback={<SettingsPanelLoading id="alerts" />}>
        <NotificationSettingsPanel />
      </Suspense>
      <section id="count-up" className="scroll-mt-28 pt-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {formatMessage("home.countUp")}
        </h2>
        <div className="mt-2">
          <Suspense fallback={<SettingsPanelLoading id="count-up-policy-settings" />}>
            <CountUpPolicySettings />
          </Suspense>
        </div>
      </section>
      <section id="developer" className="scroll-mt-28 pt-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {formatMessage("settings.developer")}
        </h2>
        <div className="mt-2 grid gap-6">
          <Suspense fallback={<SettingsPanelLoading id="api-keys" />}>
            <ApiKeysSettingsPanel initialApiKeys={props.apiKeys} initialLoadError={props.apiKeysError} />
          </Suspense>
          <Suspense fallback={<SettingsPanelLoading id="webhooks" />}>
            <WebhooksSettingsPanel
              docsHref={props.webhooksDocsHref}
              initialWebhooks={props.webhooks}
              initialLoadError={props.webhooksError}
            />
          </Suspense>
          <Suspense fallback={<SettingsPanelLoading id="mcp" />}>
            <McpSettingsPanel
              initialConnections={props.mcpConnections}
              initialLoadError={props.mcpConnectionsError}
              docsHref={props.mcpDocsHref}
              remoteUrl={props.mcpRemoteUrl}
            />
          </Suspense>
        </div>
      </section>
    </div>
  )
}

const SETTINGS_SECTION_IDS = new Set([
  "account",
  "profile",
  "defaults",
  "notifications",
  "alerts",
  "count-up",
  "count-up-policy-settings",
  "developer",
  "api-keys",
  "webhooks",
  "mcp",
])

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

function scrollToHashTarget(behavior: ScrollBehavior = "auto") {
  const id = normalizedSettingsHashId()
  if (!id) return

  const hash = `#${encodeURIComponent(id)}`
  if (globalThis.location.hash !== hash) {
    globalThis.history.replaceState(null, "", `${globalThis.location.pathname}${globalThis.location.search}${hash}`)
  }
  globalThis.document.getElementById(id)?.scrollIntoView({ block: "start", behavior })
}

function SettingsHashScroller() {
  useEffect(() => {
    const scroll = (behavior: ScrollBehavior) => {
      const timeout = globalThis.setTimeout(() => scrollToHashTarget(behavior), 0)
      return () => globalThis.clearTimeout(timeout)
    }

    let cancelScroll = scroll("auto")
    const onHashChange = () => {
      cancelScroll()
      cancelScroll = scroll("smooth")
    }

    globalThis.addEventListener("hashchange", onHashChange)
    return () => {
      cancelScroll()
      globalThis.removeEventListener("hashchange", onHashChange)
    }
  }, [])

  return null
}

const SETTINGS_NAV_ITEMS = [
  { id: "account", labelKey: "auth.account" },
  { id: "notifications", labelKey: "settings.notifications" },
  { id: "count-up", labelKey: "home.countUp" },
  { id: "developer", labelKey: "settings.developer" },
] as const

function parentSectionForHash(id: string | null) {
  if (id === "alerts") return "notifications"
  if (id === "count-up-policy-settings") return "count-up"
  if (id === "api-keys" || id === "webhooks" || id === "mcp") return "developer"
  if (id === "profile" || id === "defaults") return "account"
  return id === "notifications" || id === "count-up" || id === "developer" ? id : "account"
}

function SettingsAnchorNav(props: Readonly<{ signedIn: boolean }>) {
  const [activeId, setActiveId] = useState(() =>
    globalThis.location === undefined ? "account" : parentSectionForHash(normalizedSettingsHashId()),
  )

  useEffect(() => {
    const onHashChange = () => setActiveId(parentSectionForHash(normalizedSettingsHashId()))
    globalThis.addEventListener("hashchange", onHashChange)
    return () => globalThis.removeEventListener("hashchange", onHashChange)
  }, [])

  return (
    <nav className="sticky top-[57px] z-30 -mx-4 mt-4 overflow-x-auto border-b border-border bg-background px-4">
      <div className="flex w-max min-w-full gap-5 text-sm">
        {SETTINGS_NAV_ITEMS.filter((item) => props.signedIn || item.id === "account" || item.id === "count-up").map(
          (item) => {
            const active = activeId === item.id
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={
                  active
                    ? "shrink-0 whitespace-nowrap border-b-2 border-foreground py-2.5 font-medium"
                    : "shrink-0 whitespace-nowrap border-b-2 border-transparent py-2.5 text-muted-foreground hover:text-foreground"
                }
                onClick={(event) => {
                  event.preventDefault()
                  setActiveId(item.id)
                  globalThis.history.pushState(null, "", `#${item.id}`)
                  globalThis.document.getElementById(item.id)?.scrollIntoView({ block: "start", behavior: "smooth" })
                }}
              >
                {formatMessage(item.labelKey)}
              </a>
            )
          },
        )}
      </div>
    </nav>
  )
}

export type AccountPageInitialData = {
  apiKeys?: ApiKeyRecord[]
  apiKeysError?: string | null
  mcpConnections?: McpConnectionPublicRecord[]
  mcpConnectionsError?: string | null
  mcpDocsHref?: string | null
  mcpRemoteUrl?: string | null
  preferences?: AccountPreferencesRecord
  preferencesError?: string | null
  webhooksDocsHref?: string | null
  webhooks?: WebhookEndpointPublicRecord[]
  webhooksError?: string | null
}

export function AccountPageClient(props: Readonly<AccountPageInitialData> = {}) {
  const session = authClient.useSession()
  const sessionPending = Boolean(session.isPending)
  const signOutAction = useAccountSignOut(session)

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
    content = (
      <section id="account" className="scroll-mt-28 pt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {formatMessage("auth.account")}
        </h2>
        <AccountLoadingPanel />
      </section>
    )
  } else if (session.data?.user) {
    content = (
      <AccountPreferencesProvider initialPreferences={props.preferences} initialError={props.preferencesError}>
        <section id="account" className="scroll-mt-28 pt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {formatMessage("auth.account")}
          </h2>
          <SignedInAccountPanel
            loading={loading}
            profileName={profileName}
            signOutLoading={signOutAction.loading}
            user={session.data.user}
            onNameChange={(value) => {
              setNameDraft(value)
              setNameTouched(true)
            }}
            onNameCommit={() => runInBackground("account.updateProfileName", updateProfileName())}
            onSignOut={() => runInBackground("account.signOut", signOutAction.signOut())}
          />
        </section>
        <AccountPreferencesSections
          apiKeys={props.apiKeys}
          apiKeysError={props.apiKeysError}
          mcpConnections={props.mcpConnections}
          mcpConnectionsError={props.mcpConnectionsError}
          mcpDocsHref={props.mcpDocsHref}
          mcpRemoteUrl={props.mcpRemoteUrl}
          webhooksDocsHref={props.webhooksDocsHref}
          webhooks={props.webhooks}
          webhooksError={props.webhooksError}
        />
      </AccountPreferencesProvider>
    )
  } else {
    content = (
      <>
        <section id="account" className="scroll-mt-28 pt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {formatMessage("auth.account")}
          </h2>
          <AccountSignInRequiredPanel />
        </section>
        <section id="count-up" className="scroll-mt-28 pt-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {formatMessage("home.countUp")}
          </h2>
          <div className="mt-2">
            <Suspense fallback={<SettingsPanelLoading id="count-up-policy-settings" />}>
              <CountUpPolicySettings />
            </Suspense>
          </div>
        </section>
      </>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-16 pt-8">
      <SettingsHashScroller />
      <h1 className="text-2xl font-semibold tracking-tight">{formatMessage("auth.accountSettings")}</h1>
      <SettingsAnchorNav signedIn={Boolean(session.data?.user)} />
      <div className="grid gap-10">{content}</div>
    </main>
  )
}
