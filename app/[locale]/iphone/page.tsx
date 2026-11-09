import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { BellRing, LayoutGrid, Library, Mic, RefreshCw, ShieldCheck } from "lucide-react"

import type { ScaleStop } from "@/components/iphone/scale-demo"
import styles from "@/components/iphone/iphone.module.css"
import { LiveDial } from "@/components/iphone/live-dial"
import { ScaleDemo } from "@/components/iphone/scale-demo"
import { MarketingPageShell } from "@/components/marketing-page-shell"
import { localeHref, ogLocale, SUPPORTED_LOCALES } from "@/lib/i18n/config"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { getSiteOrigin } from "@/lib/site-config"
import { buildSoftwareApplicationJsonLd, jsonLdScriptContent } from "@/lib/structured-data"

const PATH = "/iphone"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  const path = localeHref(locale, PATH)
  return {
    // The copy already names the brand; skip the template suffix.
    title: { absolute: formatMessage("iphone.meta.title", {}, locale) },
    description: formatMessage("iphone.meta.description", {}, locale),
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, PATH)])),
        "x-default": localeHref("en", PATH),
      },
    },
    openGraph: {
      title: formatMessage("iphone.meta.title", {}, locale),
      description: formatMessage("iphone.meta.description", {}, locale),
      url: path,
      type: "website",
      locale: ogLocale(locale),
    },
  }
}

const FEATURES = [
  {
    icon: LayoutGrid,
    key: "widgets",
    title: "iphone.features.widgets.title",
    body: "iphone.features.widgets.body",
  },
  {
    icon: BellRing,
    key: "reminders",
    title: "iphone.features.reminders.title",
    body: "iphone.features.reminders.body",
  },
  {
    icon: Library,
    key: "collections",
    title: "iphone.features.collections.title",
    body: "iphone.features.collections.body",
  },
  {
    icon: RefreshCw,
    key: "sync",
    title: "iphone.features.sync.title",
    body: "iphone.features.sync.body",
  },
  {
    icon: Mic,
    key: "siri",
    title: "iphone.features.siri.title",
    body: "iphone.features.siri.body",
  },
  {
    icon: ShieldCheck,
    key: "privacy",
    title: "iphone.features.privacy.title",
    body: "iphone.features.privacy.body",
  },
] as const satisfies ReadonlyArray<{
  icon: unknown
  key: string
  title: MessageKey
  body: MessageKey
}>

export default async function IphonePage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)
  const t = (key: MessageKey) => formatMessage(key, {}, locale)
  const legend = {
    second: t("iphone.legend.second"),
    minute: t("iphone.legend.minute"),
    hour: t("iphone.legend.hour"),
    day: t("iphone.legend.day"),
    week: t("iphone.legend.week"),
  }
  const stops: ScaleStop[] = [
    {
      unit: "week",
      seconds: 120 * 86_400,
      distance: t("iphone.scale.stop.week"),
    },
    { unit: "day", seconds: 23 * 86_400, distance: t("iphone.scale.stop.day") },
    {
      unit: "hour",
      seconds: 30 * 3_600,
      distance: t("iphone.scale.stop.hour"),
    },
    {
      unit: "minute",
      seconds: 42 * 60,
      distance: t("iphone.scale.stop.minute"),
    },
    { unit: "second", seconds: 50, distance: t("iphone.scale.stop.second") },
  ]
  const appJsonLd = buildSoftwareApplicationJsonLd({
    name: t("iphone.title"),
    operatingSystem: "iOS",
    url: `${getSiteOrigin()}${localeHref(locale, PATH)}`,
    description: t("iphone.meta.description"),
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(appJsonLd) }} />
      <MarketingPageShell
        locale={locale}
        localeAlternates={Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, PATH)]))}
        mainClassName="max-w-none grid-cols-[minmax(0,1fr)] gap-0 p-0"
      >
        <section className={`${styles.stage} ${styles.stageGlow}`} aria-labelledby="iphone-title">
          <div className={styles.stageInner}>
            <span className={styles.badge}>
              <span className={styles.badgeDot} aria-hidden="true" />
              {t("iphone.badge")}
            </span>
            <h1 id="iphone-title" className={styles.title}>
              {t("iphone.title")}
            </h1>
            <p className={styles.tagline}>{t("iphone.tagline")}</p>
            <div className={styles.actions}>
              <Link className={styles.storeButton} href={localeHref(locale, "/")}>
                {t("iphone.cta.web")}
              </Link>
              <a className={styles.ghostButton} href="#iphone-features">
                {t("iphone.cta.features")}
              </a>
            </div>
            <p className={styles.note}>{t("iphone.cta.note")}</p>

            <LiveDial label={t("iphone.dial.label")} daysLabel={t("iphone.dial.days")} legend={legend} />

            <div className={styles.phones}>
              <div className={`${styles.phone} ${styles.phoneSide}`}>
                <Image src="/iphone/02-detail.jpg" alt={t("iphone.screens.detail.alt")} width={660} height={1434} />
              </div>
              <div className={`${styles.phone} ${styles.phoneCenter}`}>
                <Image
                  src="/iphone/01-home.jpg"
                  alt={t("iphone.screens.home.alt")}
                  width={660}
                  height={1434}
                  priority
                />
              </div>
              <div className={`${styles.phone} ${styles.phoneSide}`}>
                <Image src="/iphone/04-edit.jpg" alt={t("iphone.screens.edit.alt")} width={660} height={1434} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.stage} aria-labelledby="iphone-scale-title">
          <div className={styles.stageInner}>
            <div className={styles.split}>
              <div className={styles.splitCopy}>
                <h2 id="iphone-scale-title" className={styles.sectionTitle}>
                  {t("iphone.scale.title")}
                </h2>
                <p className={styles.sectionBody}>{t("iphone.scale.body")}</p>
              </div>
              <ScaleDemo stops={stops} legend={legend} />
            </div>
          </div>
        </section>

        <section className={styles.stage} aria-labelledby="iphone-lock-title">
          <div className={styles.stageInner}>
            <div className={styles.split}>
              <div className={`${styles.phone} ${styles.lockPhone}`}>
                <Image src="/iphone/03-lock.jpg" alt={t("iphone.lock.alt")} width={660} height={1434} />
              </div>
              <div className={styles.splitCopy}>
                <h2 id="iphone-lock-title" className={styles.sectionTitle}>
                  {t("iphone.lock.title")}
                </h2>
                <p className={styles.sectionBody}>{t("iphone.lock.body")}</p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="iphone-features"
          aria-labelledby="iphone-features-title"
          className="mx-auto w-full max-w-[1080px] px-4 py-16"
        >
          <h2 id="iphone-features-title" className="text-2xl font-semibold tracking-tight">
            {t("iphone.features.title")}
          </h2>
          <ul className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, key, title, body }) => (
              <li key={key} className="grid content-start gap-2">
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-base font-semibold">{t(title)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(body)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.stage} aria-labelledby="iphone-final-title">
          <div className={styles.stageInner}>
            <h2 id="iphone-final-title" className={styles.sectionTitle}>
              {t("iphone.final.title")}
            </h2>
            <p className={styles.tagline}>{t("iphone.final.body")}</p>
            <div className={styles.actions}>
              <Link className={styles.storeButton} href={localeHref(locale, "/")}>
                {t("iphone.cta.web")}
              </Link>
            </div>
          </div>
        </section>
      </MarketingPageShell>
    </>
  )
}
