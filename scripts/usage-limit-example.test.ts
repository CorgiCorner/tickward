import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const exampleDir = path.join(root, "examples/agent-usage-limits")

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
})
