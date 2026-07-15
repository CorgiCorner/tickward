import type { Metadata } from "next"
import { Suspense } from "react"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { AccountPreferencesProvider } from "@/components/account-preferences-provider"
import { HomePageLoading } from "@/components/app-shell-loading"
import { HomeClient } from "@/components/home-client"
import { CountryCalendarsSection } from "@/components/country-calendars-section"
import { DesktopAppPromo } from "@/components/desktop-app-promo"
import { FaqSection } from "@/components/faq-section"
import { GitHubStarCta } from "@/components/github-star-cta"
import { HomeContentSection } from "@/components/home-content-section"
import { HomeUseCasesSection } from "@/components/home-use-cases-section"
import { SiteFooter } from "@/components/site-footer"
import { WebMcpTools } from "@/components/webmcp-tools"
import { getCurrentActor } from "@/lib/actor.server"
import { DEFAULT_ACCOUNT_PREFERENCES, type AccountPreferencesRecord } from "@/lib/account-preferences"
import { getAccountPreferencesForUser } from "@/lib/account-preferences.server"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { planForUser, type PlanId } from "@/lib/entitlements"
import { getEntitlementsTable } from "@/lib/entitlements.server"
import { getHomeFaqs } from "@/lib/home-faqs"
import { setActiveLocale } from "@/lib/i18n/active-locale"
import { formatMessage, isSupportedLocale, localeHref, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/messages"
import { TimerStoreProvider } from "@/lib/store"
import { buildFaqPageJsonLd, buildSoftwareApplicationJsonLd, jsonLdScriptContent } from "@/lib/structured-data"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"

type HomeRouteParams = Promise<{ locale: string }>

async function resolveLocale(params: HomeRouteParams): Promise<Locale> {
  const { locale } = await params
  if (!isSupportedLocale(locale)) notFound()
  setActiveLocale(locale)
  return locale
}

// The home page is a true translation pair, so it carries hreflang alternates
// with the default locale as x-default.
export async function generateMetadata(props: Readonly<{ params: HomeRouteParams }>): Promise<Metadata> {
  const locale = await resolveLocale(props.params)

  return {
    alternates: {
      canonical: localeHref(locale, "/"),
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, "/")])),
        "x-default": "/",
      },
    },
  }
}

type HomeAccountData = {
  activePlan: PlanId
  accountPreferences: AccountPreferencesRecord | null
}

async function readHomeAccountData(): Promise<HomeAccountData> {
  const incomingHeaders = await headers()
  const requestHeaders = new Headers(incomingHeaders)
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"

  try {
    const actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}/`, { headers: requestHeaders }),
    })
    if (actor.kind !== "user") return { activePlan: "anonymous", accountPreferences: null }

    try {
      return {
        activePlan: planForUser(actor.user),
        accountPreferences: await getAccountPreferencesForUser(actor.user),
      }
    } catch (error) {
      console.error("[tickward] home.accountPreferences", error)
      return { activePlan: planForUser(actor.user), accountPreferences: DEFAULT_ACCOUNT_PREFERENCES }
    }
  } catch {
    return { activePlan: "anonymous", accountPreferences: null }
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
  const entitlementsTable = await getEntitlementsTable()
  const { accountPreferences, activePlan } = await readHomeAccountData()
  const home = <HomeClient />

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey, entitlementsTable, activePlan }}>
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

export default async function Home(props: Readonly<{ params: HomeRouteParams }>) {
  const locale = await resolveLocale(props.params)
  const homeFaqs = getHomeFaqs(locale)

  return (
    <>
      <script
        type="application/ld+json"
        // Static, trusted payload: built from i18n constants and SITE_URL only.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildSoftwareApplicationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(buildFaqPageJsonLd(homeFaqs)) }}
      />
      <Suspense fallback={<HomePageLoading />}>
        <PersonalizedHome />
      </Suspense>
      {/* Server-rendered below the Suspense boundary: hydration of the client
          app can never remove the SEO content, links, or contentinfo footer. */}
      <HomeContentSection />
      <GitHubStarCta />
      <div className="mx-auto w-full max-w-[640px] px-4 pb-16">
        <FaqSection heading={formatMessage("home.faq.heading", {}, locale)} faqs={homeFaqs} />
      </div>
      <DesktopAppPromo locale={locale} />
      <HomeUseCasesSection locale={locale} />
      <CountryCalendarsSection locale={locale} />
      <SiteFooter locale={locale} />
    </>
  )
}
