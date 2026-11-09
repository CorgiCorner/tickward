import { formatMessage } from "@/lib/i18n/messages"
import { getSiteOrigin } from "@/lib/site-config"

// Schema.org Organization markup for the press page.
export function buildOrganizationJsonLd() {
  const origin = getSiteOrigin()
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "tickward",
    url: origin,
    logo: `${origin}/press/tickward-logo-512.png`,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "press",
      email: "press@tickward.com",
    },
    founder: {
      "@type": "Person",
      name: "Michal Sniezynski",
    },
    sameAs: ["https://github.com/CorgiCorner/tickward"],
  }
}

// Schema.org SoftwareApplication markup. Defaults describe the web app on the
// marketing homepage; the iPhone app page overrides them for the iOS app.
export function buildSoftwareApplicationJsonLd(
  overrides: Readonly<{
    name?: string
    operatingSystem?: string
    url?: string
    description?: string
    softwareVersion?: string
    downloadUrl?: string
  }> = {},
) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: overrides.name ?? "tickward",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: overrides.operatingSystem ?? "Web",
    url: overrides.url ?? getSiteOrigin(),
    description: overrides.description ?? formatMessage("app.description"),
    ...(overrides.softwareVersion ? { softwareVersion: overrides.softwareVersion } : {}),
    ...(overrides.downloadUrl ? { downloadUrl: overrides.downloadUrl } : {}),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  }
}

export type ContentPublicationDates = Readonly<{
  datePublished?: string
  dateModified?: string
}>

export type DatasetDownload = Readonly<{
  path: string
  encodingFormat: "text/calendar" | "application/json"
}>

// Invalid metadata is an authoring error; these diagnostics are not product UI copy.
export function validateContentPublicationDates(dates: ContentPublicationDates) {
  for (const value of [dates.datePublished, dates.dateModified]) {
    if (value === undefined) continue
    const parsed = new Date(value)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new Error("invalid publication date: use a real YYYY-MM-DD value")
    }
  }
  if (dates.datePublished && dates.dateModified && dates.dateModified < dates.datePublished) {
    throw new Error("content modification date precedes its publication date")
  }
}

export function buildDatasetJsonLd(input: {
  name: string
  description: string
  path: string
  dates: readonly string[]
  publicationDates?: ContentPublicationDates
  downloads?: readonly DatasetDownload[]
}) {
  const origin = getSiteOrigin()
  const publicationDates = input.publicationDates ?? {}
  validateContentPublicationDates(publicationDates)
  const sortedDates = input.dates
    .map((date) => new Date(date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
  const firstDate = sortedDates[0]?.toISOString().slice(0, 10)
  const lastDate = sortedDates.at(-1)?.toISOString().slice(0, 10)

  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: input.name,
    description: input.description,
    url: `${origin}${input.path}`,
    ...(firstDate && lastDate ? { temporalCoverage: `${firstDate}/${lastDate}` } : {}),
    ...(publicationDates.datePublished ? { datePublished: publicationDates.datePublished } : {}),
    ...(publicationDates.dateModified ? { dateModified: publicationDates.dateModified } : {}),
    ...(input.downloads?.length
      ? {
          distribution: input.downloads.map((download) => {
            if (!download.path.startsWith("/") || download.path.startsWith("//")) {
              throw new Error("dataset download requires a site-relative path")
            }
            return {
              "@type": "DataDownload",
              contentUrl: `${origin}${download.path}`,
              encodingFormat: download.encodingFormat,
            }
          }),
        }
      : {}),
    publisher: {
      "@type": "Organization",
      name: "tickward",
      url: origin,
    },
    isAccessibleForFree: true,
  }
}

// Schema.org FAQPage markup. Takes plain question/answer pairs so callers own
// the content and the markup always mirrors the visible FAQ copy.
export function buildFaqPageJsonLd(faqs: readonly Readonly<{ question: string; answer: string }>[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}

// Schema.org BreadcrumbList markup from ordered name/path pairs; paths are
// resolved against the configured site origin.
export function buildBreadcrumbListJsonLd(items: ReadonlyArray<{ name: string; path: string }>) {
  const siteOrigin = getSiteOrigin()

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteOrigin}${item.path}`,
    })),
  }
}

export function jsonLdScriptContent(jsonLd: unknown): string {
  return JSON.stringify(jsonLd).replaceAll("<", String.raw`\u003c`)
}
