import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { getDocsSitemapPaths } from "@/lib/docs-config"

const rootDir = path.resolve(import.meta.dirname, "..")
const docsSiteDir = path.join(rootDir, "docs/site")

// Mintlify deploys the docs site from the docs/site subdirectory, so the .mdx
// pages, docs.json, and favicon live ONLY there. The two artifacts below also
// live at the repo root because app routes serve them - app/openapi.json
// imports the root openapi.json, and the agent-skills discovery route reads the
// root skill.md - so they must stay byte-identical to the docs/site copies.
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
  it("keeps app-served root artifacts aligned with docs/site", () => {
    const offenders = appServedDocsArtifacts.filter(
      (filePath) =>
        Buffer.compare(readFileSync(path.join(rootDir, filePath)), readFileSync(path.join(docsSiteDir, filePath))) !==
        0,
    )

    expect(offenders).toEqual([])
  })

  it("keeps the Mintlify favicon present in docs/site", () => {
    const docsJson = JSON.parse(readDocsSiteFile("docs.json")) as { favicon?: unknown }

    expect(docsJson.favicon).toBe("/favicon.png")
    expect(existsSync(path.join(docsSiteDir, "favicon.png"))).toBe(true)
  })

  it("keeps docs navigation and OpenAPI references resolvable in docs/site", () => {
    const docsJson = JSON.parse(readDocsSiteFile("docs.json"))
    const pageRefs = collectStringValues(docsJson, "pages")
    const openapiRefs = collectStringValues(docsJson, "openapi")
    const offenders: string[] = []

    for (const page of pageRefs) {
      if (!existsSync(path.join(docsSiteDir, `${page}.mdx`))) offenders.push(`docs/site/${page}.mdx`)
    }

    for (const file of openapiRefs) {
      if (!existsSync(path.join(docsSiteDir, file))) offenders.push(`docs/site/${file}`)
    }

    expect(offenders).toEqual([])
  })

  it("keeps the app sitemap docs paths aligned with docs navigation", () => {
    const originalDocsOrigin = process.env.TICKWARD_DOCS_ORIGIN
    process.env.TICKWARD_DOCS_ORIGIN = "https://docs.example.test"

    try {
      const docsJson = JSON.parse(readDocsSiteFile("docs.json"))
      const expectedPaths = collectStringValues(docsJson, "pages")
        .map((page) => (page === "index" ? "/docs" : `/docs/${page}`))
        .sort()

      expect(getDocsSitemapPaths().sort()).toEqual(expectedPaths)
    } finally {
      if (originalDocsOrigin === undefined) {
        delete process.env.TICKWARD_DOCS_ORIGIN
      } else {
        process.env.TICKWARD_DOCS_ORIGIN = originalDocsOrigin
      }
    }
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
