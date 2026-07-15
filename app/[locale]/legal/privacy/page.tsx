import type { Metadata } from "next"

import { MarketingPageShell } from "@/components/marketing-page-shell"
import { localeHref, ogLocale, SUPPORTED_LOCALES } from "@/lib/i18n/config"
import { formatMessage } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { TimerStoreProvider } from "@/lib/store"

const TITLE = "Privacy policy"
const DESCRIPTION = "How tickward handles personal data, local browser data, and cookies."

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  const path = localeHref(locale, "/legal/privacy")
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, "/legal/privacy")])),
        "x-default": localeHref("en", "/legal/privacy"),
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

export default async function PrivacyPage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)

  return (
    <TimerStoreProvider>
      <MarketingPageShell locale={locale}>
        <header className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-normal">Privacy policy</h1>
          <p className="text-sm text-muted-foreground">{formatMessage("legal.englishOnlyNotice", {}, locale)}</p>
          <p className="text-sm text-muted-foreground">Last updated: 2026-07-10</p>
        </header>

        <section className="grid gap-3">
          <SectionHeading>Who is responsible</SectionHeading>
          <p className="text-sm leading-relaxed">
            tickward is operated by Michał Śnieżyński, an independent software engineer and the data controller. You can
            contact me at{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="mailto:contact@tickward.com">
              contact@tickward.com
            </a>
            {". There is no other operating entity."}
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>What tickward is</SectionHeading>
          <p className="text-sm leading-relaxed">
            tickward is an open-source countdown timer service hosted at{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="https://tickward.com">
              tickward.com
            </a>
            {
              ". It works without an account. You can optionally create an account using an email one-time code or Sign in with Google. The source code is available under AGPL-3.0 on "
            }
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href="https://github.com/CorgiCorner/tickward"
            >
              GitHub
            </a>
            {"."}
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Data we process</SectionHeading>
          <p className="text-sm leading-relaxed">
            Without an account, timers and projects live in your browser using localStorage and first-party cookies.
            Anonymous projects can sync to the cloud when you use share or sync features.
          </p>
          <p className="text-sm leading-relaxed">
            With an account, we process your email address, display name, session records (including IP address and user
            agent), project and timer content, API keys, webhook endpoint URLs, notification and reminder settings, MCP
            and desktop connection grants, and an audit log of account actions.
          </p>
          <p className="text-sm leading-relaxed">
            Embedded timers record only the hostname of pages that embed them. This indicative discovery data is not
            analytics and is kept for up to 180 days. Server logs and Sentry error reports may contain IP addresses and
            request metadata.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Why we process it</SectionHeading>
          <p className="text-sm leading-relaxed">
            Our legal bases are performance of our contract with you when providing the service; legitimate interests in
            security, abuse prevention, reliability, and error monitoring; and consent where it applies, such as
            optional emails.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Hosting and subprocessors</SectionHeading>
          <p className="text-sm leading-relaxed">
            App hosting uses AWS Amplify, and the database also runs on AWS in eu-central-1 (Frankfurt, EU). Primary
            storage is in the EU. Some subprocessors are US companies and rely on the EU–US Data Privacy Framework
            and/or Standard Contractual Clauses for international transfers. See the{" "}
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href={localeHref(locale, "/legal/subprocessors")}
            >
              subprocessor list
            </a>
            {"."}
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Retention and deletion</SectionHeading>
          <p className="text-sm leading-relaxed">
            Cloud projects not claimed by an account are deleted automatically after a configured period of inactivity.
            Projects over the plan limit become read-only and are deleted after a configured retention window; the owner
            is emailed before deletion. The current values are shown in the app footer. Audit log entries are purged
            periodically. Deleting your account removes your account data.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Cookies</SectionHeading>
          <p className="text-sm leading-relaxed">
            tickward uses only first-party, strictly necessary or functional cookies. Better Auth session cookies keep
            you signed in and are essential. <code>td_timers</code> and <code>td_spaces</code> store anonymous timer and
            space data for about 12 months. <code>td_restoreKey</code> lets an anonymous browser restore its synced
            data. We use no advertising, cross-site tracking, third-party analytics, or analytics cookies. Because only
            necessary and functional cookies are used, tickward does not show a consent banner.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>Your rights</SectionHeading>
          <p className="text-sm leading-relaxed">
            Under the GDPR, you may request access, rectification, erasure, restriction, portability, or object to
            processing. You may also complain to a supervisory authority; in Poland, this is UODO. Email{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="mailto:contact@tickward.com">
              contact@tickward.com
            </a>{" "}
            to exercise your rights.
          </p>
        </section>

        <section className="grid gap-3">
          <SectionHeading>No sale or advertising</SectionHeading>
          <p className="text-sm leading-relaxed">
            We do not sell personal data. tickward has no ads and uses no third-party analytics.
          </p>
        </section>
      </MarketingPageShell>
    </TimerStoreProvider>
  )
}
