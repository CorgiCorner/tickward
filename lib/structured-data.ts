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
