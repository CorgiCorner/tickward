import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
}))

vi.mock("node:fs/promises", () => ({
  default: { readFile: mocks.readFile },
  readFile: mocks.readFile,
}))

describe("loadOgFonts", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.readFile.mockReset()
  })

  it("resets the cached promise after a font read failure so later calls can retry", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("font read failed"))

    const { loadOgFonts } = await import("./fonts")

    await expect(loadOgFonts()).rejects.toThrow("font read failed")

    mocks.readFile.mockResolvedValue(Buffer.from([1, 2, 3]))

    await expect(loadOgFonts()).resolves.toHaveLength(6)
    expect(mocks.readFile).toHaveBeenCalledTimes(12)
  })
})
