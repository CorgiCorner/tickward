import type { Metadata } from "next"

import { MarketingPageShell } from "@/components/marketing-page-shell"
import { getDocsPageHref } from "@/lib/docs-config"
import { localeHref, ogLocale, SUPPORTED_LOCALES } from "@/lib/i18n/config"
import { formatMessage } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { TimerStoreProvider } from "@/lib/store"

const TITLE = "Terms of service"
const DESCRIPTION = "The plain-language terms for using the hosted tickward service."

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  const path = localeHref(locale, "/legal/terms")
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, "/legal/terms")])),
        "x-default": localeHref("en", "/legal/terms"),
      },
    },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: path,
      type: "website",
      locale: ogLocale(locale),
    },
  }
}

function SectionHeading({ children }: Readonly<{ children: string }>) {
  return <h2 className="text-xl font-semibold tracking-normal">{children}</h2>
}

export default async function TermsPage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)

  return (
    <TimerStoreProvider>
      <MarketingPageShell locale={locale}>
        <header className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-normal">Terms of service</h1>
          <p className="text-sm text-muted-foreground">{formatMessage("legal.englishOnlyNotice", {}, locale)}</p>
          <p className="text-sm text-muted-foreground">Last updated: 2026-07-10</p>
        </header>

        <section className="grid gap-3">
          <SectionHeading>The service</SectionHeading>
          <p className="text-sm leading-relaxed">
            tickward is a free hosted version of the open-source countdown timer app. Plan limits apply and are
            described on the docs{" "}
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href={getDocsPageHref("/concepts/plans-and-limits")}
            >
              Plans and limits
            </a>{" "}
            page. The hosted service is operated by Michał Śnieżyński, an independent software engineer. Questions can
            be sent to{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="mailto:contact@tickward.com">
              contact@tickward.com
            </a>
            .
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Accounts</SectionHeading>
          <p className="text-sm leading-relaxed">
            You may use tickward without an account. If you create one, provide accurate information and keep your
            sign-in codes to yourself. You must be at least 16 years old to create an account.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Acceptable use</SectionHeading>
          <p className="text-sm leading-relaxed">
            Do not abuse the service, store or share unlawful content, attempt to disrupt or gain unauthorized access to
            it, or bypass technical safeguards. Respect published rate limits.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Your content</SectionHeading>
          <p className="text-sm leading-relaxed">
            Your projects, timers, and other content remain yours. You give us only the limited permission needed to
            store, process, transmit, and display that content to operate the service and the features you choose.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Retention and deletion</SectionHeading>
          <p className="text-sm leading-relaxed">
            Cloud projects not claimed by an account are deleted automatically after a configured period of inactivity.
            Projects over the plan limit become read-only and are deleted after a configured retention window; the owner
            is emailed before deletion. The current values are shown in the app footer. Audit log entries are purged
            periodically, and account deletion removes account data.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Availability and liability</SectionHeading>
          <p className="text-sm leading-relaxed">
            This is a free service provided “as is,” without warranties. We do not promise uninterrupted operation or
            that it will meet every need. To the maximum extent permitted by law, liability arising from the hosted
            service is limited. Nothing here limits rights or liability that cannot legally be limited.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Changes</SectionHeading>
          <p className="text-sm leading-relaxed">
            We may change or discontinue features. Material changes to these terms will be announced in advance in the
            app or by email where available.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Open-source version</SectionHeading>
          <p className="text-sm leading-relaxed">
            The self-hosted open-source version is governed by AGPL-3.0, not these terms. Its source is available on{" "}
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href="https://github.com/CorgiCorner/tickward"
            >
              GitHub
            </a>
            .
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Governing law</SectionHeading>
          <p className="text-sm leading-relaxed">
            These terms are governed by the laws of Poland. EU consumers and other consumers keep any mandatory
            protections provided by the law of their country of residence.
          </p>
        </section>
      </MarketingPageShell>
    </TimerStoreProvider>
  )
}
