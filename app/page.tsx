import type { Metadata } from "next"
import { Suspense } from "react"
import { headers } from "next/headers"
import { AccountPreferencesProvider } from "@/components/account-preferences-provider"
import { HomePageLoading } from "@/components/app-shell-loading"
import { HomeClient } from "@/components/home-client"
import { HomeContentSection } from "@/components/home-content-section"
import { SiteFooter } from "@/components/site-footer"
import { WebMcpTools } from "@/components/webmcp-tools"
import { getCurrentActor } from "@/lib/actor.server"
import { DEFAULT_ACCOUNT_PREFERENCES, type AccountPreferencesRecord } from "@/lib/account-preferences"
import { getAccountPreferencesForUser } from "@/lib/account-preferences.server"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { TimerStoreProvider } from "@/lib/store"
import { buildSoftwareApplicationJsonLd } from "@/lib/structured-data"
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

// Cookie/header reads live in this child so the page shell (metadata, JSON-LD,
// persistent hero content, and site footer) can render before personalization
// resolves.
async function PersonalizedHome() {
  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()
  const accountPreferences = await readHomeAccountPreferences()
  const home = <HomeClient />

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey }}>
      <WebMcpTools />
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

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, trusted payload: built from i18n constants and SITE_URL only.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildSoftwareApplicationJsonLd()) }}
      />
      <Suspense fallback={<HomePageLoading />}>
        <PersonalizedHome />
      </Suspense>
      {/* Server-rendered below the Suspense boundary: hydration of the client
          app can never remove the SEO hero, content, or contentinfo footer. */}
      <HomeContentSection />
      <SiteFooter />
    </>
  )
}
