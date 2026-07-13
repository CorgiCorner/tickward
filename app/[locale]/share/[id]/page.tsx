import type { Metadata } from "next"
import { notFound } from "next/navigation"

import NotFoundPage from "@/app/[locale]/not-found"
import { FooterFull } from "@/components/footer-full"
import { Header } from "@/components/header"
import { SharedTimerClient } from "@/components/shared-timer-client"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { getActivePlanForCurrentRequest, getEntitlementsTable } from "@/lib/entitlements.server"
import { getDocsHref } from "@/lib/docs-config"
import { formatMessage } from "@/lib/i18n/messages"
import { getPublicReleaseTag } from "@/lib/release.server"
import { noIndexRobots } from "@/lib/seo-metadata"
import { isRoutableShareId } from "@/lib/share-model"
import { resolveTimerShare } from "@/lib/share-service.server"
import { TimerStoreProvider } from "@/lib/store"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"

export const runtime = "nodejs"

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params

  if (!isRoutableShareId(id)) notFound()

  const resolved = await resolveTimerShare(id)
  if (!resolved) notFound()

  const title = resolved?.timer?.label ? resolved.timer.label : formatMessage("app.title.sharedTimer")
  return {
    title,
    robots: { ...noIndexRobots, nocache: true },
  }
}

export default async function Page(props: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await props.params

  if (!isRoutableShareId(id)) notFound()

  const resolved = await resolveTimerShare(id)
  if (!resolved) {
    // Next dev can emit a Performance.measure page error when notFound() is
    // thrown from this async page. Production still gets the real 404 status.
    if (process.env.NODE_ENV === "development") return <NotFoundPage />
    return notFound()
  }

  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()
  const [entitlementsTable, activePlan] = await Promise.all([getEntitlementsTable(), getActivePlanForCurrentRequest()])

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey, entitlementsTable, activePlan }}>
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
        <Header />
        <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-6">
          <SharedTimerClient initial={resolved} shareId={id} />
        </main>
        <FooterFull docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
