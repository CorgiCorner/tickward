import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AdminBootstrapClient } from "@/components/admin/admin-bootstrap-client"
import { FooterFull } from "@/components/footer-full"
import { Header } from "@/components/header"
import { hasAnyAdmin } from "@/lib/admin-bootstrap.server"
import { getDocsHref } from "@/lib/docs-config"
import { getActivePlanForCurrentRequest, getEntitlementsTable } from "@/lib/entitlements.server"
import { formatMessage, localeHref } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { getPublicReleaseTag } from "@/lib/release.server"
import { noIndexRobots } from "@/lib/seo-metadata"
import { TimerStoreProvider } from "@/lib/store"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  return {
    title: formatMessage("setup.metaTitle", {}, locale),
    description: formatMessage("setup.description", {}, locale),
    robots: noIndexRobots,
  }
}

export default async function SetupPage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)
  const homePath = localeHref(locale, "/")
  if (await hasAnyAdmin()) redirect(homePath)

  const adminPath = localeHref(locale, "/admin")
  const setupPath = localeHref(locale, "/setup")
  const [entitlementsTable, activePlan] = await Promise.all([getEntitlementsTable(), getActivePlanForCurrentRequest()])

  return (
    <TimerStoreProvider initialState={{ entitlementsTable, activePlan }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header />
        <AdminBootstrapClient adminPath={adminPath} homePath={homePath} setupPath={setupPath} />
        <FooterFull docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
