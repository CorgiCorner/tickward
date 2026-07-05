import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildBreadcrumbListJsonLd,
  buildDatasetJsonLd,
  buildFaqPageJsonLd,
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  jsonLdScriptContent,
} from "@/lib/structured-data"

describe("structured data", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("describes the app as a free schema.org SoftwareApplication", () => {
    const jsonLd = buildSoftwareApplicationJsonLd()

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "tickward",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    })
    expect(jsonLd.description).toBeTruthy()
    expect(typeof jsonLd.description).toBe("string")
  })

  it("tracks the configured SITE_URL for the canonical url", () => {
    vi.stubEnv("SITE_URL", "https://example.test")
    vi.stubEnv("NODE_ENV", "production")

    expect(buildSoftwareApplicationJsonLd().url).toBe("https://example.test")
  })

  it("serializes to embeddable JSON without script-breaking content", () => {
    const serialized = JSON.stringify(buildSoftwareApplicationJsonLd())

    expect(() => JSON.parse(serialized)).not.toThrow()
    expect(serialized).not.toContain("</script>")
  })

  it("builds FAQPage markup from plain question/answer pairs", () => {
    const jsonLd = buildFaqPageJsonLd([{ question: "Is it free?", answer: "Yes, it is free." }])

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is it free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, it is free.",
          },
        },
      ],
    })
  })

  it("builds Dataset markup with date coverage and publisher", () => {
    vi.stubEnv("SITE_URL", "https://example.test")
    vi.stubEnv("NODE_ENV", "production")

    const jsonLd = buildDatasetJsonLd({
      name: "US federal holidays 2027",
      description: "Visible calendar copy for the holidays.",
      path: "/en/timers/us-federal-holidays-2027",
      dates: ["2027-12-25T05:00:00.000Z", "2027-01-01T05:00:00.000Z"],
    })

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "US federal holidays 2027",
      description: "Visible calendar copy for the holidays.",
      url: "https://example.test/en/timers/us-federal-holidays-2027",
      temporalCoverage: "2027-01-01/2027-12-25",
      publisher: {
        "@type": "Organization",
        name: "tickward",
        url: "https://example.test",
      },
      isAccessibleForFree: true,
    })
  })

  it("builds BreadcrumbList markup with absolute item urls", () => {
    vi.stubEnv("SITE_URL", "https://example.test")
    vi.stubEnv("NODE_ENV", "production")

    const jsonLd = buildBreadcrumbListJsonLd([
      { name: "Home", path: "/" },
      { name: "Example", path: "/example" },
    ])

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://example.test/" },
        { "@type": "ListItem", position: 2, name: "Example", item: "https://example.test/example" },
      ],
    })
  })

  it("describes the project as a schema.org Organization with a press contact", () => {
    const jsonLd = buildOrganizationJsonLd()

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "tickward",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "press",
        email: "press@tickward.com",
      },
      founder: {
        "@type": "Person",
      },
    })
    expect(jsonLd.founder.name).toBeTruthy()
    expect(jsonLd.sameAs).toContain("https://github.com/CorgiCorner/tickward")
  })

  it("derives organization url and logo from the configured SITE_URL", () => {
    vi.stubEnv("SITE_URL", "https://example.test")
    vi.stubEnv("NODE_ENV", "production")

    const jsonLd = buildOrganizationJsonLd()

    expect(jsonLd.url).toBe("https://example.test")
    expect(jsonLd.logo).toBe("https://example.test/press/tickward-logo-512.png")
  })

  it("serializes the organization payload without script-breaking content", () => {
    const serialized = JSON.stringify(buildOrganizationJsonLd())

    expect(() => JSON.parse(serialized)).not.toThrow()
    expect(serialized).not.toContain("</script>")
  })

  it("describes frequently asked questions as schema.org FAQPage", () => {
    const jsonLd = buildFaqPageJsonLd([
      { question: "Is it free?", answer: "Yes. It is free." },
      { question: "Can I share it?", answer: "Yes. Share a read-only link." },
    ])

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "FAQPage",
    })
    expect(jsonLd.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "Is it free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. It is free.",
      },
    })
  })

  it("escapes JSON-LD script content before embedding it in HTML", () => {
    const serialized = jsonLdScriptContent(
      buildFaqPageJsonLd([{ question: "Can markup break it?", answer: "No </script> tag can break the page." }]),
    )

    expect(() => JSON.parse(serialized)).not.toThrow()
    expect(serialized).not.toContain("</script>")
    expect(serialized).toContain("\\u003c/script>")
  })
})
