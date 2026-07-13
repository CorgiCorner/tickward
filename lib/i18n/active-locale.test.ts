import { afterEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"

type LocaleStore = { locale: Locale | undefined }

afterEach(() => {
  vi.doUnmock("react")
  vi.resetModules()
})

async function importActiveLocale(cacheImplementation: (factory: () => LocaleStore) => () => LocaleStore) {
  vi.doMock("react", () => ({ cache: cacheImplementation }))
  return import("@/lib/i18n/active-locale")
}

describe("active locale", () => {
  it("uses the default locale for an unseeded request-scoped store", async () => {
    const store: LocaleStore = { locale: undefined }
    const { getActiveLocale } = await importActiveLocale(() => () => store)

    expect(getActiveLocale()).toBe(DEFAULT_LOCALE)
  })

  it("returns the locale seeded in a request-scoped store", async () => {
    const store: LocaleStore = { locale: undefined }
    const { getActiveLocale, setActiveLocale } = await importActiveLocale(() => () => store)

    setActiveLocale("pl")

    expect(getActiveLocale()).toBe("pl")
  })

  it("falls back to the module locale when cache is not memoized", async () => {
    const { getActiveLocale, setActiveLocale } = await importActiveLocale((factory) => factory)

    setActiveLocale("de")

    expect(getActiveLocale()).toBe("de")
  })
})
