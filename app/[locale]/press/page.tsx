import type { Metadata } from "next"
import Image from "next/image"

import { FooterFull } from "@/components/footer-full"
import { MarketingHeader } from "@/components/marketing-header"
import { getDocsHref, getDocsPageHref } from "@/lib/docs-config"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { getPublicReleaseTag } from "@/lib/release.server"
import { getSiteOrigin } from "@/lib/site-config"
import { TimerStoreProvider } from "@/lib/store"
import { buildOrganizationJsonLd } from "@/lib/structured-data"
import { localeHref, ogLocale, SUPPORTED_LOCALES } from "@/lib/i18n/config"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"

const GITHUB_REPO_URL = "https://github.com/CorgiCorner/tickward"

const factRows: Array<{ href?: string; labelKey: MessageKey; valueKey: MessageKey }> = [
  { labelKey: "press.facts.whatLabel", valueKey: "press.facts.whatValue" },
  { labelKey: "press.facts.launchLabel", valueKey: "press.facts.launchValue" },
  { labelKey: "press.facts.licenseLabel", valueKey: "press.facts.licenseValue" },
  { labelKey: "press.facts.platformLabel", valueKey: "press.facts.platformValue" },
  { href: GITHUB_REPO_URL, labelKey: "press.facts.sourceLabel", valueKey: "press.facts.sourceValue" },
]

// The press page is a true translation pair, so it carries hreflang
// alternates with the default locale as x-default.
export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  const path = localeHref(locale, "/press")
  return {
    title: formatMessage("press.meta.title", {}, locale),
    description: formatMessage("press.description", {}, locale),
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, "/press")])),
        "x-default": "/press",
      },
    },
    openGraph: {
      title: formatMessage("press.meta.title", {}, locale),
      description: formatMessage("press.description", {}, locale),
      url: path,
      type: "website",
      locale: ogLocale(locale),
    },
  }
}

type DescriptionBlock = {
  bodies: string[]
  label: string
}

function SectionHeading({ children }: Readonly<{ children: string }>) {
  return <h2 className="text-xl font-semibold tracking-normal">{children}</h2>
}

function Description({ bodies, label }: Readonly<DescriptionBlock>) {
  return (
    <article className="grid gap-2 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      {bodies.map((body) => (
        <p key={body} className="text-sm leading-relaxed">
          {body}
        </p>
      ))}
    </article>
  )
}

function ContactStrip() {
  const email = formatMessage("press.contact.action")

  return (
    <section aria-label={formatMessage("press.contact.title")} className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-1.5">
        <h2 className="text-sm font-medium text-muted-foreground">{formatMessage("press.contact.title")}</h2>
        <p className="text-sm leading-relaxed">{formatMessage("press.contact.body")}</p>
      </div>
      <a
        className="text-base font-semibold underline underline-offset-4 hover:text-foreground"
        href={`mailto:${email}`}
      >
        {email}
      </a>
    </section>
  )
}

export default function PressPage() {
  const siteOrigin = getSiteOrigin()
  const docsHref = getDocsHref()
  const descriptions: DescriptionBlock[] = [
    {
      label: formatMessage("press.descriptions.short50.label"),
      bodies: [formatMessage("press.descriptions.short50.body")],
    },
    {
      label: formatMessage("press.descriptions.extended150.label"),
      bodies: [
        formatMessage("press.descriptions.extended150.body1"),
        formatMessage("press.descriptions.extended150.body2"),
        formatMessage("press.descriptions.extended150.body3"),
      ],
    },
  ]
  const screenshots = [
    {
      alt: formatMessage("press.screenshots.lightAlt"),
      caption: formatMessage("press.screenshots.lightCaption"),
      src: "/press/screenshot-timers-light.png",
    },
    {
      alt: formatMessage("press.screenshots.darkAlt"),
      caption: formatMessage("press.screenshots.darkCaption"),
      src: "/press/screenshot-timers-dark.png",
    },
  ]
  const links = [
    { href: siteOrigin, label: formatMessage("press.links.app") },
    { href: GITHUB_REPO_URL, label: formatMessage("press.links.github") },
    { href: docsHref, label: formatMessage("press.links.docs") },
    { href: getDocsPageHref("/guides/self-hosting"), label: formatMessage("press.links.selfHosting") },
  ]

  return (
    <TimerStoreProvider>
      <script
        type="application/ld+json"
        // Static, trusted payload: built from i18n constants and SITE_URL only.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }}
      />
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <MarketingHeader />
        <main className="mx-auto grid w-full max-w-[720px] flex-1 gap-10 px-4 py-10">
          <header className="grid gap-3">
            <h1 className="text-3xl font-semibold tracking-normal">{formatMessage("press.title")}</h1>
            <section aria-label={formatMessage("press.oneLiner.title")}>
              <p className="text-lg font-medium leading-relaxed">{formatMessage("press.oneLiner")}</p>
            </section>
          </header>

          <ContactStrip />

          <section className="grid gap-3">
            <SectionHeading>{formatMessage("press.boilerplate.title")}</SectionHeading>
            <p className="text-sm leading-relaxed">{formatMessage("press.boilerplate.body")}</p>
          </section>

          <section className="grid gap-4">
            <SectionHeading>{formatMessage("press.facts.title")}</SectionHeading>
            <dl className="grid overflow-hidden rounded-xl border bg-card">
              {factRows.map((fact) => {
                const value = formatMessage(fact.valueKey)
                return (
                  <div
                    key={fact.labelKey}
                    className="grid gap-1 border-b p-4 last:border-b-0 sm:grid-cols-[160px_1fr] sm:gap-4"
                  >
                    <dt className="text-sm font-medium text-muted-foreground">{formatMessage(fact.labelKey)}</dt>
                    <dd className="text-sm leading-relaxed">
                      {fact.href ? (
                        <a className="underline underline-offset-4 hover:text-foreground" href={fact.href}>
                          {value}
                        </a>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>

          <section className="grid gap-4">
            <SectionHeading>{formatMessage("press.descriptions.title")}</SectionHeading>
            {descriptions.map((description) => (
              <Description key={description.label} bodies={description.bodies} label={description.label} />
            ))}
          </section>

          <section className="grid gap-4">
            <SectionHeading>{formatMessage("press.brand.title")}</SectionHeading>
            <div className="flex flex-wrap items-end gap-6">
              <a className="grid justify-items-center gap-2" href="/press/tickward-logo-512.png" download>
                <Image
                  src="/press/tickward-logo-512.png"
                  alt={formatMessage("press.assets.alt512")}
                  width={128}
                  height={128}
                  className="rounded-xl border"
                />
                <span className="text-sm underline underline-offset-4">
                  {formatMessage("press.assets.download512")}
                </span>
              </a>
              <a className="grid justify-items-center gap-2" href="/press/tickward-logo-256.png" download>
                <Image
                  src="/press/tickward-logo-256.png"
                  alt={formatMessage("press.assets.alt256")}
                  width={96}
                  height={96}
                  className="rounded-xl border"
                />
                <span className="text-sm underline underline-offset-4">
                  {formatMessage("press.assets.download256")}
                </span>
              </a>
            </div>
          </section>

          <section className="grid gap-4">
            <SectionHeading>{formatMessage("press.screenshots.title")}</SectionHeading>
            {screenshots.map((screenshot) => (
              <figure key={screenshot.src} className="grid gap-2">
                <a href={screenshot.src} download>
                  <Image
                    src={screenshot.src}
                    alt={screenshot.alt}
                    width={1280}
                    height={736}
                    unoptimized
                    className="rounded-xl border"
                  />
                </a>
                <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{screenshot.caption}</span>
                  <a className="underline underline-offset-4 hover:text-foreground" href={screenshot.src} download>
                    {formatMessage("press.screenshots.download")}
                  </a>
                </figcaption>
              </figure>
            ))}
          </section>

          <section className="grid gap-3">
            <SectionHeading>{formatMessage("press.kit.title")}</SectionHeading>
            <p className="text-sm leading-relaxed">{formatMessage("press.kit.body")}</p>
            <a
              className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
              href="/press/tickward-press-kit.zip"
              download
            >
              {formatMessage("press.kit.download")}
            </a>
          </section>

          <section className="grid gap-3">
            <SectionHeading>{formatMessage("press.founder.title")}</SectionHeading>
            <p className="text-sm leading-relaxed">{formatMessage("press.founder.bio")}</p>
          </section>

          <section className="grid gap-4">
            <SectionHeading>{formatMessage("press.links.title")}</SectionHeading>
            <ul className="grid gap-2">
              {links.map((link) => (
                <li key={link.href}>
                  <a className="text-sm underline underline-offset-4 hover:text-foreground" href={link.href}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </main>
        <FooterFull docsHref={docsHref} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
