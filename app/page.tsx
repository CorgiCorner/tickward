import type { Metadata } from "next"
import { headers } from "next/headers"
import { AccountPreferencesProvider } from "@/components/account-preferences-provider"
import { HomeClient } from "@/components/home-client"
import { getCurrentActor } from "@/lib/actor.server"
import { DEFAULT_ACCOUNT_PREFERENCES, type AccountPreferencesRecord } from "@/lib/account-preferences"
import { getAccountPreferencesForUser } from "@/lib/account-preferences.server"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { getDocsHref } from "@/lib/docs-config"
import { getPublicReleaseTag } from "@/lib/release.server"
import { TimerStoreProvider } from "@/lib/store"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
}

async function readHomeAccountPreferences(): Promise<AccountPreferencesRecord | null> {
  const incomingHeaders = await headers()
  const requestHeaders = new Headers(incomingHeaders)
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"

  try {
    const actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}/`, { headers: requestHeaders }),
    })
    if (actor.kind !== "user") return null

    try {
      return await getAccountPreferencesForUser(actor.user)
    } catch (error) {
      console.error("[tickward] home.accountPreferences", error)
      return DEFAULT_ACCOUNT_PREFERENCES
    }
  } catch {
    return null
  }
}

export default async function Home() {
  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()
  const accountPreferences = await readHomeAccountPreferences()
  const home = <HomeClient docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey }}>
      {accountPreferences ? (
        <AccountPreferencesProvider initialPreferences={accountPreferences} initialError={null}>
          {home}
        </AccountPreferencesProvider>
      ) : (
        home
      )}
    </TimerStoreProvider>
  )
}
