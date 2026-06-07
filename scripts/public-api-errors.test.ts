import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const apiDir = path.join(process.cwd(), "app/api")

function routeFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...routeFiles(fullPath))
      continue
    }
    if (entry === "route.ts") files.push(fullPath)
  }
  return files
}

describe("public API errors", () => {
  it("keeps API route errors behind the public error contract", () => {
    const violations = routeFiles(apiDir).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8")
      const relative = path.relative(process.cwd(), filePath)
      const rawTextResponse = /new\s+NextResponse\s*\(\s*["'`]/.test(source)
      const rawJsonError = /NextResponse\.json\s*\(\s*\{\s*error\s*:\s*["'`]/.test(source)
      return [
        rawTextResponse ? `${relative}: raw text NextResponse` : null,
        rawJsonError ? `${relative}: raw JSON error` : null,
      ].filter((violation): violation is string => violation !== null)
    })

    expect(violations).toEqual([])
  })
})
