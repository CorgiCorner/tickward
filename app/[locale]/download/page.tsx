import type { Metadata } from "next"
import Image from "next/image"
import { ArrowDownToLine, BatteryMedium, TimerIcon, Wifi } from "lucide-react"

import { MarketingPageShell } from "@/components/marketing-page-shell"
import { StepsSection } from "@/components/steps-section"
import { Button } from "@/components/ui/button"
import { getLatestDesktopRelease } from "@/lib/desktop-release"
import { getActivePlanForCurrentRequest, getEntitlementsTable } from "@/lib/entitlements.server"
import { localeHref, ogLocale, SUPPORTED_LOCALES } from "@/lib/i18n/config"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { getSiteOrigin } from "@/lib/site-config"
import { TimerStoreProvider } from "@/lib/store"
import { buildSoftwareApplicationJsonLd, jsonLdScriptContent } from "@/lib/structured-data"

const HOMEBREW_TAP_COMMAND = "brew tap msniezynski/tickward"
const HOMEBREW_INSTALL_COMMAND = "brew install --cask tickward-desktop"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  const path = localeHref(locale, "/download")
  return {
    title: formatMessage("download.meta.title", {}, locale),
    description: formatMessage("download.meta.description", {}, locale),
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, "/download")])),
        "x-default": localeHref("en", "/download"),
      },
    },
    openGraph: {
      title: formatMessage("download.meta.title", {}, locale),
      description: formatMessage("download.meta.description", {}, locale),
      url: path,
      type: "website",
      locale: ogLocale(locale),
    },
  }
}

// A miniature, purely decorative macOS menu bar with the tickward countdown
// chip sitting next to the clock — shows where the app lives before anyone
// installs anything.
function MenuBarPreview({ caption }: Readonly<{ caption: string }>) {
  return (
    <figure className="grid gap-2">
      <div aria-hidden="true" className="rounded-xl border bg-muted/40 p-4 sm:p-6">
        <div className="flex items-center justify-end gap-3 overflow-hidden rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-xs">
          <Wifi className="size-3.5 shrink-0" />
          <BatteryMedium className="size-4 shrink-0" />
          <span className="flex shrink-0 items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground">
            <TimerIcon className="size-3.5" />
            12d 04:32
          </span>
          <span className="shrink-0 font-mono">09:41</span>
        </div>
      </div>
      <figcaption className="text-center text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

function CommandBlock({ commands }: Readonly<{ commands: readonly string[] }>) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-sm leading-relaxed">
      {commands.map((command) => (
        <code key={command} className="block">
          {command}
        </code>
      ))}
    </pre>
  )
}

export default async function DownloadPage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)
  const t = (key: MessageKey, params: Record<string, string> = {}) => formatMessage(key, params, locale)
  const release = await getLatestDesktopRelease()
  const steps = [
    { title: t("download.steps.1.title"), body: t("download.steps.1.body") },
    { title: t("download.steps.2.title"), body: t("download.steps.2.body") },
    { title: t("download.steps.3.title"), body: t("download.steps.3.body") },
  ]
  const appJsonLd = buildSoftwareApplicationJsonLd({
    name: t("download.title"),
    operatingSystem: "macOS",
    url: `${getSiteOrigin()}${localeHref(locale, "/download")}`,
    description: t("download.meta.description"),
    softwareVersion: release?.version,
    downloadUrl: release?.dmgUrl,
  })
  const [entitlementsTable, activePlan] = await Promise.all([getEntitlementsTable(), getActivePlanForCurrentRequest()])

  return (
    <TimerStoreProvider initialState={{ entitlementsTable, activePlan }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(appJsonLd) }} />
      <MarketingPageShell
        locale={locale}
        localeAlternates={Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, "/download")]))}
      >
        <header className="grid justify-items-center gap-4 text-center">
          <Image
            src="/desktop/tickward-desktop-256.png"
            alt={t("download.iconAlt")}
            width={96}
            height={96}
            priority
            className="rounded-2xl border shadow-xs"
          />
          <div className="grid gap-2">
            <h1 className="text-3xl font-semibold tracking-normal">{t("download.title")}</h1>
            <p className="text-base leading-relaxed text-muted-foreground">{t("download.tagline")}</p>
          </div>
          <div className="grid justify-items-center gap-2">
            {release ? (
              <>
                <Button asChild size="lg">
                  <a href={release.dmgUrl} download>
                    <ArrowDownToLine className="size-4" />
                    {t("download.cta")}
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">{t("download.cta.meta", { version: release.version })}</p>
              </>
            ) : (
              <p className="max-w-[400px] text-sm leading-relaxed text-muted-foreground">
                {t("download.cta.unavailable")}
              </p>
            )}
          </div>
        </header>

        <MenuBarPreview caption={t("download.preview.caption")} />

        <StepsSection heading={t("download.steps.title")} steps={steps} />

        <section className="grid gap-3">
          <h2 className="text-xl font-semibold tracking-normal">{t("download.after.title")}</h2>
          <ul className="grid gap-2">
            <li className="text-sm leading-relaxed text-muted-foreground">{t("download.after.updates")}</li>
            <li className="text-sm leading-relaxed text-muted-foreground">{t("download.after.sync")}</li>
          </ul>
        </section>

        <section className="grid gap-3">
          <h2 className="text-xl font-semibold tracking-normal">{t("download.brew.title")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("download.brew.body")}</p>
          <CommandBlock commands={[HOMEBREW_TAP_COMMAND, HOMEBREW_INSTALL_COMMAND]} />
        </section>

        <section className="grid gap-1 border-t pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">{t("download.requirements")}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("download.web.note")}</p>
        </section>
      </MarketingPageShell>
    </TimerStoreProvider>
  )
}
