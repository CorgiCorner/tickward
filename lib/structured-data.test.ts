import { afterEach, describe, expect, it, vi } from "vitest"

import { buildOrganizationJsonLd, buildSoftwareApplicationJsonLd } from "@/lib/structured-data"

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
})
