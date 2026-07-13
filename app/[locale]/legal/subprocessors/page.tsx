import type { Metadata } from "next"

import { MarketingPageShell } from "@/components/marketing-page-shell"
import { localeHref, ogLocale, SUPPORTED_LOCALES } from "@/lib/i18n/config"
import { formatMessage } from "@/lib/i18n/messages"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"
import { TimerStoreProvider } from "@/lib/store"

const TITLE = "Subprocessors"
const DESCRIPTION = "Service providers that help operate the hosted tickward service."

const subprocessors = [
  {
    provider: "Amazon Web Services (AWS)",
    purpose: "Hosting and database (eu-central-1, Frankfurt)",
    location: "eu-central-1 (Frankfurt, EU)",
  },
  {
    provider: "Resend",
    purpose: "Transactional email (sign-in codes, notifications, retention alerts)",
    location: "May involve the United States",
  },
  {
    provider: "Upstash",
    purpose: "Redis used for rate limiting and embed host discovery",
    location: "May involve the United States",
  },
  {
    provider: "Google",
    purpose: 'Optional "Sign in with Google" (only if the user chooses it)',
    location: "May involve the United States",
  },
  {
    provider: "Sentry (Functional Software, Inc.)",
    purpose: "Error monitoring",
    location: "May involve the United States",
  },
  {
    provider: "Unsplash",
    purpose: "Image search (queries sent only when the user searches images)",
    location: "May involve the United States",
  },
  {
    provider: "Temporal Technologies (Temporal Cloud)",
    purpose: "Scheduling of reminders/notifications",
    location: "May involve the United States",
  },
] as const

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  const path = localeHref(locale, "/legal/subprocessors")
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((other) => [other, localeHref(other, "/legal/subprocessors")])),
        "x-default": localeHref("en", "/legal/subprocessors"),
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

export default async function SubprocessorsPage(props: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = await resolveRouteLocale(props.params)

  return (
    <TimerStoreProvider>
      <MarketingPageShell locale={locale}>
        <header className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-normal">Subprocessors</h1>
          <p className="text-sm text-muted-foreground">{formatMessage("legal.englishOnlyNotice", {}, locale)}</p>
          <p className="text-sm text-muted-foreground">Last updated: 2026-07-10</p>
        </header>

        <section className="grid gap-4">
          <p className="text-sm leading-relaxed">
            These providers help operate the hosted tickward service. Primary storage is in the EU. Where a provider
            involves the United States, transfers rely on the EU–US Data Privacy Framework and/or Standard Contractual
            Clauses.
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 font-medium">Provider</th>
                  <th className="p-3 font-medium">Purpose</th>
                  <th className="p-3 font-medium">Location/region</th>
                </tr>
              </thead>
              <tbody>
                {subprocessors.map((subprocessor) => (
                  <tr key={subprocessor.provider} className="border-t align-top">
                    <td className="p-3 font-medium">{subprocessor.provider}</td>
                    <td className="p-3 leading-relaxed">{subprocessor.purpose}</td>
                    <td className="p-3 leading-relaxed">{subprocessor.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm leading-relaxed">
            This list may change. Material changes are announced in the changelog.
          </p>
        </section>
      </MarketingPageShell>
    </TimerStoreProvider>
  )
}
