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

// Schema.org SoftwareApplication markup for the marketing homepage.
export function buildSoftwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "tickward",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    url: getSiteOrigin(),
    description: formatMessage("app.description"),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
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
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c")
}
