"use client"

import { UserIcon } from "lucide-react"
import Link from "next/link"
import { lazy, Suspense, useEffect, useState } from "react"
import { toast } from "sonner"

import { AccountAvatar, cleanUserName, type AccountUser } from "@/components/account-button"
import { AccountPreferencesProvider, useAccountPreferences } from "@/components/account-preferences-provider"
import type { ApiKeyRecord } from "@/components/api-keys-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useLocale } from "@/components/locale-provider"
import type { AccountPreferencesRecord } from "@/lib/account-preferences"
import { authClient } from "@/lib/auth/auth-client"
import { authErrorMessage } from "@/lib/auth/auth-client-errors"
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
    <section id={props.id} className="grid gap-4 rounded-lg border p-4" aria-busy="true">
      <div className="grid gap-2">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
    </section>
  )
}

const TimerDefaultsSettingsPanel = lazy(() =>
  import("@/components/timer-defaults-settings").then((mod) => ({ default: mod.TimerDefaultsSettingsPanel })),
)

const NotificationSettingsPanel = lazy(() =>
  import("@/components/notification-settings").then((mod) => ({ default: mod.NotificationSettingsPanel })),
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
  return <div className="rounded-lg border p-4 text-sm text-muted-foreground">{formatMessage("auth.loading")}</div>
}

function AccountSignInRequiredPanel() {
  const locale = useLocale()

  return (
    <div className="grid gap-3 rounded-lg border p-4 text-sm">
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
    <div className="grid gap-6">
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
              onClick={() => void refreshPreferences()}
            >
              {formatMessage("apiKeys.retry")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismissError}>
              {formatMessage("common.close")}
            </Button>
          </div>
        </div>
      ) : null}
      <Suspense fallback={<SettingsPanelLoading id="defaults" />}>
        <TimerDefaultsSettingsPanel />
      </Suspense>
      <Suspense fallback={<SettingsPanelLoading id="alerts" />}>
        <NotificationSettingsPanel />
      </Suspense>
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
  )
}

const SETTINGS_SECTION_IDS = new Set(["profile", "defaults", "alerts", "api-keys", "webhooks", "mcp"])

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
      ) : null}
    </main>
  )
}
