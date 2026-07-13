import type { Metadata } from "next"
import { AccountPageClient, type AccountPageInitialData } from "@/components/account-auth"
import { FooterFull } from "@/components/footer-full"
import { Header } from "@/components/header"
import { getCurrentActor } from "@/lib/actor.server"
import { DEFAULT_ACCOUNT_PREFERENCES } from "@/lib/account-preferences"
import { getAccountPreferencesForUser } from "@/lib/account-preferences.server"
import { listApiKeysForUser } from "@/lib/api-keys.server"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { planForUser } from "@/lib/entitlements"
import { getEntitlementsTable } from "@/lib/entitlements.server"
import type { UserActor } from "@/lib/contracts"
import { getDocsHref, getDocsPageHref } from "@/lib/docs-config"
import { formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"
import { getMcpRemoteUrl } from "@/lib/mcp-config.server"
import { listMcpConnectionsForUser } from "@/lib/mcp-oauth.server"
import { getPublicReleaseTag } from "@/lib/release.server"
import { noIndexRobots } from "@/lib/seo-metadata"
import { TimerStoreProvider } from "@/lib/store"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"
import { listWebhookEndpointsForUser } from "@/lib/webhooks.server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  return {
    title: formatMessage("auth.accountSettings", {}, locale),
    description: formatMessage("auth.description.signedIn", {}, locale),
    robots: noIndexRobots,
  }
}

async function requireSignedInSettingsUser(locale: Locale): Promise<UserActor> {
  const incomingHeaders = await headers()
  const requestHeaders = new Headers(incomingHeaders)
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"
  const settingsPath = localeHref(locale, "/settings")

  try {
    const actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}${settingsPath}`, { headers: requestHeaders }),
    })
    if (actor.kind === "user") return actor
  } catch {}

  redirect(`${localeHref(locale, "/sign-in")}?next=${encodeURIComponent(settingsPath)}`)
}

export async function readInitialAccountData(user: UserActor["user"]): Promise<AccountPageInitialData> {
  const [preferencesResult, apiKeysResult, mcpConnectionsResult, webhooksResult] = await Promise.allSettled([
    getAccountPreferencesForUser(user),
    listApiKeysForUser(user),
    listMcpConnectionsForUser(user),
    listWebhookEndpointsForUser(user),
  ])

  if (preferencesResult.status === "rejected") {
    console.error("[tickward] settings.initialPreferences", preferencesResult.reason)
  }
  if (apiKeysResult.status === "rejected") {
    console.error("[tickward] settings.initialApiKeys", apiKeysResult.reason)
  }
  if (mcpConnectionsResult.status === "rejected") {
    console.error("[tickward] settings.initialMcpConnections", mcpConnectionsResult.reason)
  }
  if (webhooksResult.status === "rejected") {
    console.error("[tickward] settings.initialWebhooks", webhooksResult.reason)
  }

  return {
    apiKeys: apiKeysResult.status === "fulfilled" ? apiKeysResult.value : [],
    apiKeysError: apiKeysResult.status === "fulfilled" ? null : formatMessage("apiKeys.unavailable"),
    mcpConnections: mcpConnectionsResult.status === "fulfilled" ? mcpConnectionsResult.value : [],
    mcpConnectionsError:
      mcpConnectionsResult.status === "fulfilled" ? null : formatMessage("mcp.connectionsUnavailable"),
    mcpDocsHref: getDocsPageHref("/guides/mcp"),
    mcpRemoteUrl: getMcpRemoteUrl(),
    preferences: preferencesResult.status === "fulfilled" ? preferencesResult.value : DEFAULT_ACCOUNT_PREFERENCES,
    preferencesError: preferencesResult.status === "fulfilled" ? null : formatMessage("settings.preferencesLoadFailed"),
    webhooksDocsHref: getDocsPageHref("/guides/webhooks"),
    webhooks: webhooksResult.status === "fulfilled" ? webhooksResult.value : [],
    webhooksError: webhooksResult.status === "fulfilled" ? null : formatMessage("webhooks.unavailable"),
  }
}

export default async function SettingsPage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)
  const actor = await requireSignedInSettingsUser(locale)
  const initialAccountData = await readInitialAccountData(actor.user)
  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()
  const entitlementsTable = await getEntitlementsTable()

  return (
    <TimerStoreProvider
      initialState={{ timers, spaces, restoreKey, entitlementsTable, activePlan: planForUser(actor.user) }}
    >
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header />
        <AccountPageClient {...initialAccountData} />
        <FooterFull docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
