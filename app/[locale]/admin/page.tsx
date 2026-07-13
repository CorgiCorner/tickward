import type { Metadata } from "next"
import type { ReactNode } from "react"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

import { ADMIN_COPY } from "@/components/admin/admin-copy"
import { DailyBarChart } from "@/components/admin/daily-bar-chart"
import { PlanEntitlementsEditor } from "@/components/admin/plan-entitlements-editor"
import { StatCard } from "@/components/admin/stat-card"
import { StatTable, type StatTableColumn, type StatTableRow } from "@/components/admin/stat-table"
import { Badge } from "@/components/ui/badge"
import { FooterFull } from "@/components/footer-full"
import { Header } from "@/components/header"
import { getCurrentActor } from "@/lib/actor.server"
import { getAdminStats, type AdminStats } from "@/lib/admin-stats.server"
import { hasAnyAdmin } from "@/lib/admin-bootstrap.server"
import { actorRole } from "@/lib/auth/permissions"
import type { UserActor } from "@/lib/contracts"
import { getDocsHref } from "@/lib/docs-config"
import { defaultEntitlementsTable, planForUser } from "@/lib/entitlements"
import { getEntitlementsTable } from "@/lib/entitlements.server"
import { formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { getPublicReleaseTag } from "@/lib/release.server"
import { noIndexRobots } from "@/lib/seo-metadata"
import { TimerStoreProvider } from "@/lib/store"

type AdminPageProps = Readonly<{ params: Promise<{ locale: string }> }>

const numberFormatter = new Intl.NumberFormat("en-US")
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

const countColumns: StatTableColumn[] = [
  { key: "label", label: ADMIN_COPY.tables.columns.kind },
  { key: "count", label: ADMIN_COPY.tables.columns.count, align: "right" },
]
const statusColumns: StatTableColumn[] = [
  { key: "label", label: ADMIN_COPY.tables.columns.status },
  { key: "count", label: ADMIN_COPY.tables.columns.count, align: "right" },
]
const deliveryColumns: StatTableColumn[] = [
  { key: "channel", label: ADMIN_COPY.tables.columns.channel },
  { key: "status", label: ADMIN_COPY.tables.columns.status },
  { key: "success", label: ADMIN_COPY.tables.columns.success, align: "right" },
  { key: "failure", label: ADMIN_COPY.tables.columns.failure, align: "right" },
]
const failureColumns: StatTableColumn[] = [
  { key: "endpoint", label: ADMIN_COPY.tables.columns.endpointId },
  { key: "response", label: ADMIN_COPY.tables.columns.response },
  { key: "failedAt", label: ADMIN_COPY.tables.columns.failedAt },
  { key: "attempts", label: ADMIN_COPY.tables.columns.attempts, align: "right" },
]

export async function generateMetadata(props: AdminPageProps): Promise<Metadata> {
  await resolveRouteLocale(props.params)
  return {
    title: { absolute: ADMIN_COPY.metaTitle },
    description: ADMIN_COPY.metaDescription,
    robots: noIndexRobots,
  }
}

async function requireAdminUser(locale: Locale): Promise<UserActor> {
  const incomingHeaders = await headers()
  const requestHeaders = new Headers(incomingHeaders)
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"
  const adminPath = localeHref(locale, "/admin")
  let adminExists: Promise<boolean> | undefined
  const hasAdmin = () => (adminExists ??= hasAnyAdmin())

  let actor: Awaited<ReturnType<typeof getCurrentActor>>
  try {
    actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}${adminPath}`, { headers: requestHeaders }),
    })
  } catch {
    if (!(await hasAdmin())) redirect(localeHref(locale, "/setup"))
    redirect(`${localeHref(locale, "/sign-in")}?next=${encodeURIComponent(adminPath)}`)
  }

  if (actor.kind !== "user") {
    if (!(await hasAdmin())) redirect(localeHref(locale, "/setup"))
    redirect(`${localeHref(locale, "/sign-in")}?next=${encodeURIComponent(adminPath)}`)
  }
  if (actorRole(actor) !== "admin") {
    if (!(await hasAdmin())) redirect(localeHref(locale, "/setup"))
    notFound()
  }

  return actor
}

function formatCount(value: number) {
  return numberFormatter.format(value)
}

function formatSignedCount(value: number) {
  return `+${formatCount(value)}`
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function countRows(rows: Array<{ count: number; kind: string }>): StatTableRow[] {
  return rows.map((row) => ({
    id: row.kind,
    cells: {
      label: <Badge variant="secondary">{row.kind}</Badge>,
      count: formatCount(row.count),
    },
  }))
}

function statusRows(rows: Array<{ count: number; status: string }>): StatTableRow[] {
  return rows.map((row) => ({
    id: row.status,
    cells: {
      label: <Badge variant="outline">{row.status}</Badge>,
      count: formatCount(row.count),
    },
  }))
}

function deliveryRows(rows: AdminStats["notifications"]["deliveryByChannel7d"]): StatTableRow[] {
  return rows.map((row) => ({
    id: `${row.channel}:${row.status}`,
    cells: {
      channel: <Badge variant="secondary">{row.channel}</Badge>,
      status: <Badge variant="outline">{row.status}</Badge>,
      success: formatCount(row.success),
      failure: formatCount(row.failure),
    },
  }))
}

function recentFailureRows(rows: AdminStats["notifications"]["recentWebhookFailures"]): StatTableRow[] {
  return rows.map((row) => ({
    id: row.id,
    cells: {
      endpoint: (
        <div className="grid min-w-0 gap-1">
          <span className="max-w-[16rem] truncate font-mono text-xs">{row.endpointId}</span>
          {row.error ? <span className="max-w-[18rem] truncate text-xs text-muted-foreground">{row.error}</span> : null}
        </div>
      ),
      response:
        row.responseStatus === null ? (
          <Badge variant="outline">{ADMIN_COPY.tables.recentWebhookFailures.noResponseStatus}</Badge>
        ) : (
          <Badge variant="destructive">{formatCount(row.responseStatus)}</Badge>
        ),
      failedAt: row.failedAt ? formatDateTime(row.failedAt) : ADMIN_COPY.tables.recentWebhookFailures.noFailureDate,
      attempts: formatCount(row.attemptCount),
    },
  }))
}

function SectionShell({
  children,
  description,
  heading,
}: Readonly<{
  children: ReactNode
  description: string
  heading: string
}>) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold tracking-normal">{heading}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

export default async function AdminPage(props: AdminPageProps) {
  const locale = await resolveRouteLocale(props.params)
  const actor = await requireAdminUser(locale)
  const [stats, entitlementsTable] = await Promise.all([getAdminStats(), getEntitlementsTable()])
  const webhookFailures7d =
    stats.notifications.webhookDeliveriesByStatus7d.find((row) => row.status === "failed")?.count ?? 0
  const deliveryFailures7d = stats.notifications.deliveryByChannel7d.reduce((total, row) => total + row.failure, 0)
  const deliverySuccesses7d = stats.notifications.deliveryByChannel7d.reduce((total, row) => total + row.success, 0)

  return (
    <TimerStoreProvider
      initialState={{
        restoreKey: null,
        spaces: [],
        timers: [],
        entitlementsTable,
        activePlan: planForUser(actor.user),
      }}
    >
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header />
        <main className="mx-auto grid w-full max-w-[640px] flex-1 gap-8 px-4 py-8">
          <header className="grid gap-2">
            <h1 className="text-3xl font-semibold tracking-normal">{ADMIN_COPY.heading}</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{ADMIN_COPY.intro}</p>
            <p className="text-xs text-muted-foreground/75">
              {ADMIN_COPY.generatedAt(formatDateTime(stats.generatedAt))}
            </p>
          </header>

          <SectionShell
            heading={formatMessage("admin.entitlements.heading")}
            description={formatMessage("admin.entitlements.description")}
          >
            <PlanEntitlementsEditor defaults={defaultEntitlementsTable()} entitlements={entitlementsTable} />
          </SectionShell>

          <SectionShell {...ADMIN_COPY.sections.users}>
            <div className="grid gap-3 grid-cols-2">
              <StatCard label={ADMIN_COPY.metrics.usersTotal} value={formatCount(stats.users.total)} />
              <StatCard
                label={ADMIN_COPY.metrics.usersNew7d}
                subline={ADMIN_COPY.metricDetails.last7d(formatSignedCount(stats.users.new7d))}
                value={formatCount(stats.users.new7d)}
              />
              <StatCard
                label={ADMIN_COPY.metrics.usersNew30d}
                subline={ADMIN_COPY.metricDetails.last30d(formatSignedCount(stats.users.new30d))}
                value={formatCount(stats.users.new30d)}
              />
              <StatCard label={ADMIN_COPY.metrics.usersBanned} value={formatCount(stats.users.banned)} />
              <StatCard
                label={ADMIN_COPY.metrics.activeSessions}
                subline={ADMIN_COPY.metricDetails.activeNow}
                value={formatCount(stats.users.activeSessions)}
              />
            </div>
            <DailyBarChart ariaLabel={ADMIN_COPY.charts.dailySignupsAria} points={stats.users.dailySignups} />
          </SectionShell>

          <SectionShell {...ADMIN_COPY.sections.usage}>
            <div className="grid gap-3 grid-cols-2">
              <StatCard label={ADMIN_COPY.metrics.timersActive} value={formatCount(stats.usage.timersActive)} />
              <StatCard label={ADMIN_COPY.metrics.timersArchived} value={formatCount(stats.usage.timersArchived)} />
              <StatCard label={ADMIN_COPY.metrics.projectsOwned} value={formatCount(stats.usage.projectsOwned)} />
              <StatCard
                label={ADMIN_COPY.metrics.projectsOwnerless}
                value={formatCount(stats.usage.projectsOwnerless)}
              />
              <StatCard label={ADMIN_COPY.metrics.sharesTotal} value={formatCount(stats.usage.sharesTotal)} />
              <StatCard
                label={ADMIN_COPY.metrics.pushSubscriptionsActive}
                value={formatCount(stats.usage.pushSubscriptionsActive)}
              />
            </div>
            <DailyBarChart
              ariaLabel={ADMIN_COPY.charts.dailyTimersCreatedAria}
              points={stats.usage.dailyTimersCreated}
            />
          </SectionShell>

          <SectionShell {...ADMIN_COPY.sections.integrations}>
            <div className="grid gap-3 grid-cols-2">
              <StatCard
                label={ADMIN_COPY.metrics.apiKeysActive}
                value={formatCount(stats.integrations.apiKeysActive)}
              />
              <StatCard
                label={ADMIN_COPY.metrics.apiKeysRevoked}
                value={formatCount(stats.integrations.apiKeysRevoked)}
              />
              <StatCard
                label={ADMIN_COPY.metrics.apiKeysUsed7d}
                subline={ADMIN_COPY.metricDetails.last7d(formatCount(stats.integrations.apiKeysUsed7d))}
                value={formatCount(stats.integrations.apiKeysUsed7d)}
              />
              <StatCard
                label={ADMIN_COPY.metrics.mcpGrantsActive}
                subline={ADMIN_COPY.metricDetails.activeTotal(formatCount(stats.integrations.mcpGrantsTotal))}
                value={formatCount(stats.integrations.mcpGrantsActive)}
              />
              <StatCard
                label={ADMIN_COPY.metrics.deviceGrantsActive}
                subline={ADMIN_COPY.metricDetails.activeTotal(formatCount(stats.integrations.deviceGrantsTotal))}
                value={formatCount(stats.integrations.deviceGrantsActive)}
              />
            </div>
            <div className="grid gap-4">
              <StatTable
                caption={ADMIN_COPY.tables.apiKeysByKind.caption}
                columns={countColumns}
                emptyLabel={ADMIN_COPY.tables.apiKeysByKind.empty}
                heading={ADMIN_COPY.tables.apiKeysByKind.heading}
                rows={countRows(stats.integrations.apiKeysByKind)}
              />
              <StatTable
                caption={ADMIN_COPY.tables.webhookEndpointsByStatus.caption}
                columns={statusColumns}
                emptyLabel={ADMIN_COPY.tables.webhookEndpointsByStatus.empty}
                heading={ADMIN_COPY.tables.webhookEndpointsByStatus.heading}
                rows={statusRows(stats.integrations.webhookEndpointsByStatus)}
              />
            </div>
          </SectionShell>

          <SectionShell {...ADMIN_COPY.sections.notifications}>
            <div className="grid gap-3 grid-cols-2">
              <StatCard
                label={ADMIN_COPY.metrics.outboxPending}
                value={formatCount(stats.notifications.outboxPending)}
              />
              <StatCard
                label={ADMIN_COPY.metrics.webhookFailures7d}
                subline={ADMIN_COPY.metricDetails.last7d(formatCount(webhookFailures7d))}
                value={formatCount(webhookFailures7d)}
              />
              <StatCard
                label={ADMIN_COPY.metrics.deliveryFailures7d}
                subline={ADMIN_COPY.metricDetails.successfulDeliveries(formatCount(deliverySuccesses7d))}
                value={formatCount(deliveryFailures7d)}
              />
            </div>
            <div className="grid gap-4">
              <StatTable
                caption={ADMIN_COPY.tables.deliveryByChannel7d.caption}
                columns={deliveryColumns}
                emptyLabel={ADMIN_COPY.tables.deliveryByChannel7d.empty}
                heading={ADMIN_COPY.tables.deliveryByChannel7d.heading}
                rows={deliveryRows(stats.notifications.deliveryByChannel7d)}
              />
              <StatTable
                caption={ADMIN_COPY.tables.outboxByStatus.caption}
                columns={statusColumns}
                emptyLabel={ADMIN_COPY.tables.outboxByStatus.empty}
                heading={ADMIN_COPY.tables.outboxByStatus.heading}
                rows={statusRows(stats.notifications.outboxByStatus)}
              />
              <StatTable
                caption={ADMIN_COPY.tables.webhookDeliveriesByStatus7d.caption}
                columns={statusColumns}
                emptyLabel={ADMIN_COPY.tables.webhookDeliveriesByStatus7d.empty}
                heading={ADMIN_COPY.tables.webhookDeliveriesByStatus7d.heading}
                rows={statusRows(stats.notifications.webhookDeliveriesByStatus7d)}
              />
              <StatTable
                caption={ADMIN_COPY.tables.recentWebhookFailures.caption}
                columns={failureColumns}
                emptyLabel={ADMIN_COPY.tables.recentWebhookFailures.empty}
                heading={ADMIN_COPY.tables.recentWebhookFailures.heading}
                rows={recentFailureRows(stats.notifications.recentWebhookFailures)}
              />
            </div>
          </SectionShell>
        </main>
        <FooterFull docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
