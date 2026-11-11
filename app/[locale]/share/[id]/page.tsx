import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import NotFoundPage from "@/app/[locale]/not-found"
import { FooterStatusDot } from "@/components/footer-status-dot"
import { Header } from "@/components/header"
import { SharedTimerClient } from "@/components/shared-timer-client"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import { getActivePlanForCurrentRequest, getEntitlementsTable } from "@/lib/entitlements.server"
import { formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { noIndexRobots } from "@/lib/seo-metadata"
import { isRoutableShareId } from "@/lib/share-model"
import { resolveTimerShare } from "@/lib/share-service.server"
import { STATUS_PAGE_URL } from "@/lib/status-summary"
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

const SHARE_FOOTER_LINK_CLASS = "text-muted-foreground hover:text-foreground"

// A visitor who opened a shared link gets one footer line; the full footer
// with the content catalog stays on the marketing pages.
function ShareFooter(props: Readonly<{ locale: Locale }>) {
  const year = new Date().getFullYear()
  return (
    <footer data-slot="share-footer" className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 text-xs text-muted-foreground">
        <span>
          {formatMessage("app.browserTitle.default", {}, props.locale)}{" "}
          {formatMessage("footer.copyrightYear", { year }, props.locale)}
        </span>
        <nav aria-label={formatMessage("footer.legal", {}, props.locale)} className="flex items-center gap-4">
          <Link className={SHARE_FOOTER_LINK_CLASS} href={localeHref(props.locale, "/legal/privacy")}>
            {formatMessage("footer.legal.privacy", {}, props.locale)}
          </Link>
          <Link className={SHARE_FOOTER_LINK_CLASS} href={localeHref(props.locale, "/legal/terms")}>
            {formatMessage("footer.legal.terms", {}, props.locale)}
          </Link>
          <a
            className={`${SHARE_FOOTER_LINK_CLASS} inline-flex items-center gap-1.5`}
            href={STATUS_PAGE_URL}
            target="_blank"
            rel="noreferrer"
          >
            <FooterStatusDot />
            {formatMessage("footer.status", {}, props.locale)}
          </a>
        </nav>
      </div>
    </footer>
  )
}

export default async function Page(props: Readonly<{ params: Promise<{ id: string; locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)
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
        <ShareFooter locale={locale} />
      </div>
    </TimerStoreProvider>
  )
}
