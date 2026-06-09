import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const rootDir = path.resolve(import.meta.dirname, "..")

const syncedDocsFiles = [
  "api-reference.mdx",
  "docs.json",
  "guides/agent-usage.mdx",
  "openapi.json",
  "skill.md",
] as const

function readProjectFile(filePath: string) {
  return readFileSync(path.join(rootDir, filePath), "utf8")
}

describe("root docs sync", () => {
  it("keeps root Mintlify files aligned with docs/site", () => {
    const offenders = syncedDocsFiles.filter(
      (filePath) => readProjectFile(filePath) !== readProjectFile(path.join("docs/site", filePath)),
    )

    expect(offenders).toEqual([])
  })

  it("keeps the root Mintlify favicon available", () => {
    const docsJson = JSON.parse(readProjectFile("docs.json")) as { favicon?: unknown }

    expect(docsJson.favicon).toBe("/favicon.png")
    expect(existsSync(path.join(rootDir, "favicon.png"))).toBe(true)
  })
})
