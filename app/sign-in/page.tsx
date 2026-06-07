import type { Metadata } from "next"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { SignInPageClient } from "@/components/sign-in-auth"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { getDocsHref } from "@/lib/docs-config"
import { formatMessage } from "@/lib/i18n/messages"
import { getPublicReleaseTag } from "@/lib/release.server"
import { noIndexRobots } from "@/lib/seo-metadata"
import { TimerStoreProvider } from "@/lib/store"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"

export const metadata: Metadata = {
  title: formatMessage("auth.signIn"),
  description: formatMessage("auth.description.signIn"),
  robots: noIndexRobots,
}

export default async function SignInPage(props: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const searchParams = await props.searchParams
  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header timerCount={timers.length} />
        <SignInPageClient nextPath={searchParams.next} />
        <Footer docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
