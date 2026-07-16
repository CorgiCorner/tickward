import { beforeEach, describe, expect, it } from "vitest"

import {
  LOCAL_COUNT_UP_POLICY_STORAGE_KEY,
  readLocalCountUpPolicy,
  setLocalCountUpPolicy,
} from "@/lib/local-count-up-policy.client"

describe("local attention policy", () => {
  beforeEach(() => localStorage.clear())

  it("defaults to keeping occurrences until manually moved", () => {
    expect(readLocalCountUpPolicy()).toEqual({ mode: "until-i-move-it", minutes: null })
  })

  it("persists custom policy minutes across reloads", () => {
    setLocalCountUpPolicy({ mode: "custom", minutes: 45 })

    expect(readLocalCountUpPolicy()).toEqual({ mode: "custom", minutes: 45 })
    expect(localStorage.getItem(LOCAL_COUNT_UP_POLICY_STORAGE_KEY)).toContain('"minutes":45')
  })

  it("falls back safely when browser storage is malformed", () => {
    localStorage.setItem(LOCAL_COUNT_UP_POLICY_STORAGE_KEY, "not-json")
    expect(readLocalCountUpPolicy()).toEqual({ mode: "until-i-move-it", minutes: null })
  })
})
