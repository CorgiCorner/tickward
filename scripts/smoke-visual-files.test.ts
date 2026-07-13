import { lstat, mkdtemp, mkdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { prepareScreenshotDirectory } from "./smoke-visual-files.mjs"

const testDirectories = new Set<string>()

afterEach(async () => {
  await Promise.all([...testDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  testDirectories.clear()
})

describe("prepareScreenshotDirectory", () => {
  it("creates distinct private temporary directories and cleans them up", async () => {
    const first = await prepareScreenshotDirectory()
    const second = await prepareScreenshotDirectory()
    testDirectories.add(first.path)
    testDirectories.add(second.path)

    expect(first.path).not.toBe(second.path)
    expect((await lstat(first.path)).mode & 0o777).toBe(0o700)

    await first.cleanup()
    testDirectories.delete(first.path)
    await expect(lstat(first.path)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects a configured symlink output directory", async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "tickward-visual-files-test-"))
    testDirectories.add(fixture)
    const target = path.join(fixture, "target")
    const link = path.join(fixture, "link")
    await mkdir(target)
    await symlink(target, link, "dir")

    await expect(prepareScreenshotDirectory(link)).rejects.toThrow("real directory")
  })

  it("preserves an explicitly configured output directory", async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "tickward-visual-files-test-"))
    testDirectories.add(fixture)
    const configured = path.join(fixture, "screenshots")

    const output = await prepareScreenshotDirectory(configured)
    await output.cleanup()

    expect((await lstat(configured)).isDirectory()).toBe(true)
    expect((await lstat(configured)).mode & 0o777).toBe(0o700)
  })
})
