import type { Metadata } from "next"
import { Header } from "@/components/header"
import { OtpSignInPageClient } from "@/components/sign-in-auth"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { formatMessage } from "@/lib/i18n/messages"
import { noIndexRobots } from "@/lib/seo-metadata"
import { TimerStoreProvider } from "@/lib/store"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  return {
    title: formatMessage("auth.verifyCode", {}, locale),
    description: formatMessage("auth.description.signIn", {}, locale),
    robots: noIndexRobots,
  }
}

export default async function SignInOtpPage(
  props: Readonly<{ searchParams: Promise<{ email?: string; next?: string }> }>,
) {
  const searchParams = await props.searchParams
  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header />
        <OtpSignInPageClient email={searchParams.email ?? ""} nextPath={searchParams.next} />
      </div>
    </TimerStoreProvider>
  )
}
