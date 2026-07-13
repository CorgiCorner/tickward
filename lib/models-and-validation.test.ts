import { describe, expect, it } from "vitest"

import { getEntitlements } from "@/lib/entitlements"
import {
  DEFAULT_PROJECT_NAME,
  createProjectSnapshot,
  isProjectSnapshot,
  isValidRestoreKey as isValidProjectRestoreKey,
  normalizeProjectName,
  validateProjectSnapshot,
} from "@/lib/project-model"
import { isValidRestoreKey as isValidShareRestoreKey, isValidShareId } from "@/lib/share-model"
import { PUBLIC_ERROR_CODES } from "@/lib/public-errors"
import {
  isSpaceArray,
  isTimerArray,
  isValidColor,
  isValidPhotoId,
  isValidTimezone,
  validateSpacesPayload,
  validateTimersPayload,
} from "@/lib/validate"
import { makeSpace, makeTimer } from "@/test/factories"

describe("project/share/space models", () => {
  it("normalizes project names and restore keys", () => {
    expect(normalizeProjectName("  Roadmap  ")).toBe("Roadmap")
    expect(normalizeProjectName("   ")).toBe(DEFAULT_PROJECT_NAME)
    expect(normalizeProjectName("x".repeat(50))).toHaveLength(40)
    expect(isValidProjectRestoreKey("abc_DEF-123")).toBe(true)
    expect(isValidProjectRestoreKey("short")).toBe(false)
  })

  it("creates and validates project snapshots", () => {
    const snapshot = createProjectSnapshot({
      name: "  Product launch ",
      timers: [makeTimer()],
      spaces: [makeSpace()],
      updatedAt: "2026-05-24T00:00:00.000Z",
    })

    expect(snapshot.name).toBe("Product launch")
    expect(isProjectSnapshot(snapshot)).toBe(true)
    expect(validateProjectSnapshot(snapshot, getEntitlements())).toBeNull()
    expect(
      validateProjectSnapshot(
        {
          ...snapshot,
          timers: Array.from({ length: 51 }, (_, i) => makeTimer({ id: `t-${i}` })),
        },
        getEntitlements(),
      ),
    ).toEqual({
      code: PUBLIC_ERROR_CODES.tooManyTimers,
      details: { max: 50 },
      messageKey: "errors.tooManyTimers",
    })
    expect(
      validateProjectSnapshot(
        {
          ...snapshot,
          spaces: Array.from({ length: 3 }, (_, i) => makeSpace({ id: `s-${i}` })),
        },
        getEntitlements(),
      ),
    ).toEqual({
      code: PUBLIC_ERROR_CODES.tooManySpaces,
      details: { max: 2 },
      messageKey: "errors.tooManySpaces",
    })
  })

  it("validates share and space identifiers", () => {
    expect(isValidShareRestoreKey("restoreKey_123")).toBe(true)
    expect(isValidShareId("share-id_123")).toBe(true)
  })
})

describe("payload validation", () => {
  it("accepts valid timers and spaces", () => {
    expect(isTimerArray([makeTimer({ color: "#aabbcc" })])).toBe(true)
    expect(isTimerArray([makeTimer({ timezone: "UTC" })])).toBe(true)
    expect(isTimerArray([{ ...makeTimer(), notification: { enabled: true } }])).toBe(true)
    expect(isSpaceArray([makeSpace({ color: "#aabbcc" })])).toBe(true)
  })

  it("rejects invalid timers, colors, images, and spaces", () => {
    expect(isValidColor("#abcdef")).toBe(true)
    expect(isValidColor("#xyzxyz")).toBe(false)
    expect(isValidPhotoId("abc_DEF-123")).toBe(true)
    expect(isValidPhotoId("../bad")).toBe(false)
    expect(isValidTimezone("UTC")).toBe(true)
    expect(isTimerArray([makeTimer({ targetDate: "not-a-date" })])).toBe(false)
    expect(
      isTimerArray([
        makeTimer({
          image: {
            unsplashId: "photo-a",
            url: "https://example.com/photo.jpg",
            thumbUrl: "https://images.unsplash.com/thumb.jpg",
            authorName: "Ada",
            authorUrl: "https://unsplash.com/@ada",
          },
        }),
      ]),
    ).toBe(false)
    expect(isSpaceArray([makeSpace({ color: "red" })])).toBe(false)
  })

  it("returns actionable validation messages for invalid payload fields", () => {
    expect(validateTimersPayload([makeTimer({ label: "x".repeat(201) })])).toContain("exceeds 200 character limit")
    expect(validateSpacesPayload([makeSpace({ name: "x".repeat(31) })])).toContain("exceeds 30 character limit")
  })
})
