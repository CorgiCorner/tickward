import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const rootDir = path.resolve(import.meta.dirname, "..")

const syncedDocsFiles = [
  "api-reference.mdx",
  "docs.json",
  "guides/api-quickstart.mdx",
  "guides/agent-usage.mdx",
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

function readProjectFile(filePath: string) {
  return readFileSync(path.join(rootDir, filePath), "utf8")
}

function readProjectBytes(filePath: string) {
  return readFileSync(path.join(rootDir, filePath))
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

describe("root docs sync", () => {
  it("keeps root Mintlify files aligned with docs/site", () => {
    const offenders = syncedDocsFiles.filter(
      (filePath) => readProjectFile(filePath) !== readProjectFile(path.join("docs/site", filePath)),
    )

    expect(offenders).toEqual([])
  })

  it("keeps root Mintlify binary files aligned with docs/site", () => {
    const offenders = syncedBinaryDocsFiles.filter(
      (filePath) =>
        Buffer.compare(readProjectBytes(filePath), readProjectBytes(path.join("docs/site", filePath))) !== 0,
    )

    expect(offenders).toEqual([])
  })

  it("keeps the root Mintlify favicon available", () => {
    const docsJson = JSON.parse(readProjectFile("docs.json")) as { favicon?: unknown }

    expect(docsJson.favicon).toBe("/favicon.png")
    expect(existsSync(path.join(rootDir, "favicon.png"))).toBe(true)
  })

  it("keeps docs navigation and OpenAPI references resolvable from root and docs/site", () => {
    const docsJson = JSON.parse(readProjectFile("docs.json"))
    const pageRefs = collectStringValues(docsJson, "pages")
    const openapiRefs = collectStringValues(docsJson, "openapi")
    const offenders: string[] = []

    for (const page of pageRefs) {
      const file = `${page}.mdx`
      if (!existsSync(path.join(rootDir, file))) offenders.push(file)
      if (!existsSync(path.join(rootDir, "docs/site", file))) offenders.push(`docs/site/${file}`)
    }

    for (const file of openapiRefs) {
      if (!existsSync(path.join(rootDir, file))) offenders.push(file)
      if (!existsSync(path.join(rootDir, "docs/site", file))) offenders.push(`docs/site/${file}`)
    }

    expect(offenders).toEqual([])
  })

  it("keeps the documented public API response contract agent-friendly", () => {
    const openapi = JSON.parse(readProjectFile("openapi.json"))

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
