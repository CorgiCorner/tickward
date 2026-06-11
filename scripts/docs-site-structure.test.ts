import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const rootDir = path.resolve(import.meta.dirname, "..")
const docsSiteDir = path.join(rootDir, "docs/site")

const syncedDocsFiles = [
  "api-reference.mdx",
  "concepts/countdown-accuracy.mdx",
  "docs.json",
  "guides/agent-usage.mdx",
  "guides/api-quickstart.mdx",
  "guides/embedding-timers.mdx",
  "guides/mcp.mdx",
  "guides/recipes/create-project-with-timers.mdx",
  "guides/recipes/preview-and-delete-project.mdx",
  "guides/recipes/retry-safe-mutation.mdx",
  "guides/self-hosting.mdx",
  "guides/webhooks.mdx",
  "index.mdx",
  "openapi.json",
  "skill.md",
] as const

const syncedBinaryDocsFiles = ["favicon.png"] as const

// These root artifacts are served by app routes (app/openapi.json and the
// agent-skills discovery index), so they stay at the root but must remain
// byte-identical to the canonical docs/site copies.
const appServedDocsArtifacts = ["openapi.json", "skill.md"] as const

function readDocsSiteFile(filePath: string) {
  return readFileSync(path.join(docsSiteDir, filePath), "utf8")
}

function collectStringValues(config: unknown, key: string) {
  const values: string[] = []

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    if (!value || typeof value !== "object") return
    const record = value as Record<string, unknown>
    const candidate = record[key]
    if (typeof candidate === "string") values.push(candidate)
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === "string") values.push(item)
      }
    }
    for (const child of Object.values(record)) visit(child)
  }

  visit(config)
  return [...new Set(values)].sort()
}

function schema(openapi: unknown, name: string) {
  const schemas = (openapi as { components?: { schemas?: Record<string, unknown> } }).components?.schemas
  return schemas?.[name] as { required?: string[]; properties?: Record<string, unknown> } | undefined
}

describe("docs site structure", () => {
  it("keeps root Mintlify files aligned with docs/site", () => {
    const offenders = syncedDocsFiles.filter(
      (filePath) =>
        Buffer.compare(readFileSync(path.join(rootDir, filePath)), readFileSync(path.join(docsSiteDir, filePath))) !==
        0,
    )

    expect(offenders).toEqual([])
  })

  it("keeps root Mintlify binary files aligned with docs/site", () => {
    const offenders = syncedBinaryDocsFiles.filter(
      (filePath) =>
        Buffer.compare(readFileSync(path.join(rootDir, filePath)), readFileSync(path.join(docsSiteDir, filePath))) !==
        0,
    )

    expect(offenders).toEqual([])
  })

  it("keeps app-served root artifacts aligned with docs/site", () => {
    const offenders = appServedDocsArtifacts.filter(
      (filePath) =>
        Buffer.compare(readFileSync(path.join(rootDir, filePath)), readFileSync(path.join(docsSiteDir, filePath))) !==
        0,
    )

    expect(offenders).toEqual([])
  })

  it("keeps the Mintlify favicon available inside docs/site", () => {
    const docsJson = JSON.parse(readDocsSiteFile("docs.json")) as { favicon?: unknown }

    expect(docsJson.favicon).toBe("/favicon.png")
    expect(existsSync(path.join(rootDir, "favicon.png"))).toBe(true)
    expect(existsSync(path.join(docsSiteDir, "favicon.png"))).toBe(true)
  })

  it("keeps docs navigation and OpenAPI references resolvable from root and docs/site", () => {
    const docsJson = JSON.parse(readDocsSiteFile("docs.json"))
    const pageRefs = collectStringValues(docsJson, "pages")
    const openapiRefs = collectStringValues(docsJson, "openapi")
    const offenders: string[] = []

    for (const page of pageRefs) {
      const file = `${page}.mdx`
      if (!existsSync(path.join(rootDir, file))) offenders.push(file)
      if (!existsSync(path.join(docsSiteDir, file))) offenders.push(`docs/site/${file}`)
    }

    for (const file of openapiRefs) {
      if (!existsSync(path.join(rootDir, file))) offenders.push(file)
      if (!existsSync(path.join(docsSiteDir, file))) offenders.push(`docs/site/${file}`)
    }

    expect(offenders).toEqual([])
  })

  it("keeps the documented public API response contract agent-friendly", () => {
    const openapi = JSON.parse(readDocsSiteFile("openapi.json"))

    expect(schema(openapi, "ErrorResponse")?.properties?.error).toMatchObject({
      properties: {
        type: {
          enum: expect.arrayContaining(["insufficient_scope"]),
        },
      },
    })
    expect(schema(openapi, "Timer")?.required).toEqual(
      expect.arrayContaining(["project_name", "effective_target_date"]),
    )
    expect(schema(openapi, "Space")?.required).toEqual(expect.arrayContaining(["project_name"]))
    expect(schema(openapi, "Share")?.required).toEqual(expect.arrayContaining(["project_name", "timer_label"]))
  })
})
