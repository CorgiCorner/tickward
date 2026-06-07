import type { Metadata } from "next"
import { AccountPageClient, type AccountPageInitialData } from "@/components/account-auth"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { getCurrentActor } from "@/lib/actor.server"
import { DEFAULT_ACCOUNT_PREFERENCES } from "@/lib/account-preferences"
import { getAccountPreferencesForUser } from "@/lib/account-preferences.server"
import { listApiKeysForUser } from "@/lib/api-keys.server"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import type { UserActor } from "@/lib/contracts"
import { getDocsHref } from "@/lib/docs-config"
import { formatMessage } from "@/lib/i18n/messages"
import { getPublicReleaseTag } from "@/lib/release.server"
import { noIndexRobots } from "@/lib/seo-metadata"
import { TimerStoreProvider } from "@/lib/store"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: formatMessage("auth.accountSettings"),
  description: formatMessage("auth.description.signedIn"),
  robots: noIndexRobots,
}

async function requireSignedInSettingsUser(): Promise<UserActor> {
  const incomingHeaders = await headers()
  const requestHeaders = new Headers(incomingHeaders)
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"

  try {
    const actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}/settings`, { headers: requestHeaders }),
    })
    if (actor.kind === "user") return actor
  } catch {}

  redirect(`/sign-in?next=${encodeURIComponent("/settings")}`)
}

export async function readInitialAccountData(user: UserActor["user"]): Promise<AccountPageInitialData> {
  const [preferencesResult, apiKeysResult] = await Promise.allSettled([
    getAccountPreferencesForUser(user),
    listApiKeysForUser(user),
  ])

  if (preferencesResult.status === "rejected") {
    console.error("[tickward] settings.initialPreferences", preferencesResult.reason)
  }
  if (apiKeysResult.status === "rejected") {
    console.error("[tickward] settings.initialApiKeys", apiKeysResult.reason)
  }

  return {
    apiKeys: apiKeysResult.status === "fulfilled" ? apiKeysResult.value : [],
    apiKeysError: apiKeysResult.status === "fulfilled" ? null : formatMessage("apiKeys.unavailable"),
    preferences: preferencesResult.status === "fulfilled" ? preferencesResult.value : DEFAULT_ACCOUNT_PREFERENCES,
    preferencesError: preferencesResult.status === "fulfilled" ? null : formatMessage("settings.preferencesLoadFailed"),
  }
}

export default async function SettingsPage() {
  const actor = await requireSignedInSettingsUser()
  const initialAccountData = await readInitialAccountData(actor.user)
  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header timerCount={timers.length} />
        <AccountPageClient {...initialAccountData} />
        <Footer docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
