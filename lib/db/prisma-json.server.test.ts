import { describe, expect, it } from "vitest"

import { jsonInput } from "@/lib/db/prisma-json.server"

describe("jsonInput", () => {
  it("returns a deep copy detached from the input", () => {
    const input = { nested: { items: [1, 2, 3] } }
    const result = jsonInput(input) as { nested: { items: number[] } }

    expect(result).toEqual(input)
    expect(result).not.toBe(input)
    expect(result.nested).not.toBe(input.nested)

    result.nested.items.push(4)
    expect(input.nested.items).toEqual([1, 2, 3])
  })

  it("normalizes Date values to ISO strings", () => {
    const result = jsonInput({ createdAt: new Date("2026-01-02T03:04:05.000Z") })

    expect(result).toEqual({ createdAt: "2026-01-02T03:04:05.000Z" })
  })

  it("drops undefined properties instead of keeping them", () => {
    const result = jsonInput({ kept: "value", dropped: undefined })

    expect(result).toEqual({ kept: "value" })
    expect(Object.keys(result as Record<string, unknown>)).toEqual(["kept"])
  })

  it("drops function properties instead of throwing", () => {
    const result = jsonInput({ kept: "value", callback: () => "ignored" })

    expect(result).toEqual({ kept: "value" })
  })

  it("honors custom toJSON implementations", () => {
    const result = jsonInput({ payload: { toJSON: () => "wire-format" } })

    expect(result).toEqual({ payload: "wire-format" })
  })

  it("strips prototypes down to plain objects", () => {
    class Snapshot {
      constructor(readonly label: string) {}
    }

    const result = jsonInput(new Snapshot("release"))

    expect(result).toEqual({ label: "release" })
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it("preserves null values and arrays", () => {
    const result = jsonInput({ empty: null, list: ["a", 1, false, null] })

    expect(result).toEqual({ empty: null, list: ["a", 1, false, null] })
  })
})
