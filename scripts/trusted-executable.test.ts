import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolveTrustedExecutable } from "./trusted-executable.mjs"

// Fixtures live under the repo, not os.tmpdir(): on Linux /tmp is world-writable
// (mode 1777), so the resolver rightly distrusts every path below it.
const fixtureRoot = path.join(process.cwd(), "node_modules", ".cache", "trusted-executable-tests")

const temporaryDirectories: string[] = []

function makeDirectory(mode: number) {
  mkdirSync(fixtureRoot, { recursive: true })
  const directory = mkdtempSync(path.join(fixtureRoot, "tickward-executable-"))
  chmodSync(directory, mode)
  temporaryDirectories.push(directory)
  return directory
}

function makeExecutable(directory: string, name: string) {
  const executable = path.join(directory, name)
  writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
  return executable
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("resolveTrustedExecutable", () => {
  it("ignores a hostile writable PATH prefix", () => {
    const hostileDirectory = makeDirectory(0o777)
    const trustedDirectory = makeDirectory(0o700)
    const hostileExecutable = makeExecutable(hostileDirectory, "fixture-tool")
    const trustedExecutable = makeExecutable(trustedDirectory, "fixture-tool")

    const resolved = resolveTrustedExecutable("fixture-tool", {
      pathValue: `${hostileDirectory}${path.delimiter}${trustedDirectory}`,
    })

    expect(resolved).toBe(realpathSync(trustedExecutable))
    expect(resolved).not.toBe(realpathSync(hostileExecutable))
  })

  it("rejects executable directories below a writable ancestor", () => {
    const hostileParent = makeDirectory(0o777)
    const nestedDirectory = path.join(hostileParent, "nested", "bin")
    mkdirSync(nestedDirectory, { mode: 0o755, recursive: true })
    makeExecutable(nestedDirectory, "fixture-tool")

    expect(() => resolveTrustedExecutable("fixture-tool", { pathValue: nestedDirectory })).toThrow(
      "Unable to resolve fixture-tool",
    )
  })

  it("rejects relative PATH entries", () => {
    expect(() => resolveTrustedExecutable("fixture-tool", { pathValue: "." })).toThrow("Unable to resolve fixture-tool")
  })
})
