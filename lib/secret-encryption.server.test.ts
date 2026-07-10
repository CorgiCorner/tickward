import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setActiveLocale } from "@/lib/i18n/active-locale"
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secret-encryption.server"

const TEST_KEY = Buffer.alloc(32, 7).toString("base64")

describe("secret encryption", () => {
  beforeEach(() => {
    setActiveLocale("en")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("roundtrips encrypted secrets when a key is configured", () => {
    vi.stubEnv("TICKWARD_ENCRYPTION_KEY", TEST_KEY)

    const encrypted = encryptSecret("whsec_test_secret")

    expect(isEncryptedSecret(encrypted)).toBe(true)
    expect(encrypted).not.toBe("whsec_test_secret")
    expect(decryptSecret(encrypted)).toBe("whsec_test_secret")
  })

  it("rejects tampered encrypted secrets", () => {
    vi.stubEnv("TICKWARD_ENCRYPTION_KEY", TEST_KEY)
    const parts = encryptSecret("whsec_test_secret").split(":")
    const tag = Buffer.from(parts[2], "base64")
    tag[0] ^= 1
    parts[2] = tag.toString("base64")

    expect(() => decryptSecret(parts.join(":"))).toThrow("could not be decrypted")
  })

  it("falls back to plaintext when no key is configured", () => {
    vi.stubEnv("TICKWARD_ENCRYPTION_KEY", undefined)

    expect(encryptSecret("whsec_plain")).toBe("whsec_plain")
    expect(decryptSecret("whsec_plain")).toBe("whsec_plain")
  })

  it("rejects malformed encryption keys", () => {
    vi.stubEnv("TICKWARD_ENCRYPTION_KEY", Buffer.alloc(31, 7).toString("base64"))

    expect(() => encryptSecret("whsec_test_secret")).toThrow("base64-encoded 32-byte key")
  })

  it("requires the key to decrypt encrypted secrets", () => {
    vi.stubEnv("TICKWARD_ENCRYPTION_KEY", TEST_KEY)
    const encrypted = encryptSecret("whsec_test_secret")

    vi.stubEnv("TICKWARD_ENCRYPTION_KEY", undefined)

    expect(() => decryptSecret(encrypted)).toThrow("required to decrypt")
  })
})
