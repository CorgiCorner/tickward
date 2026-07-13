import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveCodexExecutable } from "../examples/agent-usage-limits/codex/usage-limit-watcher.mjs"

const root = process.cwd()
const exampleDir = path.join(root, "examples/agent-usage-limits")
// Fixtures live under the repo, not os.tmpdir(): on Linux /tmp is world-writable
// (mode 1777), so the resolver rightly distrusts every path below it.
const fixtureRoot = path.join(root, "node_modules", ".cache", "trusted-executable-tests")

const scriptFiles = ["claude-code/usage-limit-hook.mjs", "codex/usage-limit-watcher.mjs"]

function readExampleFile(file: string) {
  return readFileSync(path.join(exampleDir, file), "utf8")
}

describe("agent usage limits example", () => {
  it("keeps the usage limit scripts copy-pasteable and deployment-neutral", () => {
    for (const file of scriptFiles) {
      expect(existsSync(path.join(exampleDir, file))).toBe(true)

      const script = readExampleFile(file)
      expect(script).toContain("TICKWARD_BASE_URL")
      expect(script).toContain("TICKWARD_API_KEY")
      expect(script).toContain("TICKWARD_PROJECT_ID")
      expect(script).toContain("TICKWARD_DRY_RUN")
      expect(script).toContain("/api/v1/projects/")
      expect(script).toContain("Idempotency-Key")
      expect(script).toContain("reminders")
      expect(script).not.toContain("tickward.com")
      expect(script).not.toContain("/Users/")
    }
  })

  it("keeps the README present and free of machine-local paths", () => {
    expect(existsSync(path.join(exampleDir, "README.md"))).toBe(true)

    const readme = readExampleFile("README.md")
    expect(readme).not.toContain("tickward.com")
    expect(readme).not.toContain("/Users/")
  })

  it("does not resolve the Codex executable from a hostile PATH prefix", () => {
    mkdirSync(fixtureRoot, { recursive: true })
    const hostileDirectory = mkdtempSync(path.join(fixtureRoot, "tickward-hostile-path-"))
    const trustedDirectory = mkdtempSync(path.join(fixtureRoot, "tickward-trusted-path-"))
    try {
      chmodSync(hostileDirectory, 0o777)
      chmodSync(trustedDirectory, 0o700)
      const hostileExecutable = path.join(hostileDirectory, "codex")
      const trustedExecutable = path.join(trustedDirectory, "codex")
      writeFileSync(hostileExecutable, "#!/bin/sh\nexit 99\n", { mode: 0o755 })
      writeFileSync(trustedExecutable, "#!/bin/sh\nexit 0\n", { mode: 0o755 })

      expect(
        resolveCodexExecutable({
          configuredExecutable: "",
          pathValue: `${hostileDirectory}${path.delimiter}${trustedDirectory}`,
        }),
      ).toBe(realpathSync(trustedExecutable))
    } finally {
      rmSync(hostileDirectory, { force: true, recursive: true })
      rmSync(trustedDirectory, { force: true, recursive: true })
    }
  })

  it("requires CODEX_EXECUTABLE to be an absolute trusted path", () => {
    expect(() => resolveCodexExecutable({ configuredExecutable: "codex", pathValue: "" })).toThrow(
      "CODEX_EXECUTABLE must be an executable absolute path",
    )
  })
})
