import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const scanRoots = ["app", "components", "lib"].map((root) => path.join(process.cwd(), root))

const skippedDirs = [".next", "components/storybook", "lib/generated", "lib/i18n", "node_modules", "storybook-static"]

const skippedFilePatterns = [/\.stories\.[cm]?[tj]sx?$/, /\.test\.[cm]?[tj]sx?$/, /\.d\.ts$/]
// app/[locale]/legal: legal documents are intentionally English-only (single
// canonical version); the pages carry a localized "provided in English" notice.
const contentDirs = ["app/[locale]/legal", "lib/marketing-content", "lib/use-cases/content"]

const checkedExtensions = new Set([".ts", ".tsx"])

type CopyPattern = {
  label: string
  pattern: RegExp
}

const rawCopyPatterns: CopyPattern[] = [
  {
    label: "raw toast text",
    pattern: /\btoast(?:\.(?:success|error|warning|info|message))?\(\s*["'`][A-Z][^"'`]*["'`]/,
  },
  {
    label: "raw placeholder prop",
    pattern: /\bplaceholder\s*=\s*["'][A-Z][^"']*["']/,
  },
  {
    label: "raw aria-label prop",
    pattern: /\baria-label\s*=\s*["'][A-Z][^"']*["']/,
  },
  {
    label: "raw dialog heading",
    pattern: /<(?:Dialog|AlertDialog|Sheet|Popover)(?:Title|Description)[^>]*>\s*[A-Z][^<{]*/,
  },
  {
    label: "raw label text",
    pattern: /<Label[^>]*>\s*[A-Z][^<{]*/,
  },
  {
    label: "raw button text",
    pattern: /<Button[^>]*>\s*[A-Z][^<{]*/,
  },
  {
    label: "raw JSX text",
    pattern: /<[\w.:-]+(?:\s[^>]*)?>\s*[A-Z][^<{]*<\/[\w.:-]+>/,
  },
  {
    label: "raw notification title",
    pattern: /\b(?:new\s+Notification|showNotification)\s*\(\s*["'`][A-Z][^"'`]*["'`]/,
  },
  {
    label: "raw outgoing message field",
    pattern: /\b(?:subject|title|body)\s*:\s*["'`][A-Z][^"'`]*["'`]/,
  },
  {
    label: "raw error text",
    pattern: /\bnew Error\(\s*["'`][A-Z][^"'`]*["'`]/,
  },
  {
    label: "raw console text",
    pattern: /\bconsole\.(?:error|warn|info|log)\(\s*["'`][A-Z][^"'`]*["'`]/,
  },
]

function shouldSkip(filePath: string) {
  const relative = path.relative(process.cwd(), filePath).split(path.sep).join("/")
  return (
    skippedDirs.some((dir) => relative === dir || relative.startsWith(`${dir}/`)) ||
    contentDirs.some((dir) => relative === dir || relative.startsWith(`${dir}/`)) ||
    skippedFilePatterns.some((pattern) => pattern.test(relative))
  )
}

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    if (shouldSkip(fullPath)) continue

    if (statSync(fullPath).isDirectory()) {
      files.push(...sourceFiles(fullPath))
      continue
    }

    if (checkedExtensions.has(path.extname(fullPath))) files.push(fullPath)
  }
  return files
}

describe("i18n UI copy", () => {
  it("keeps product-facing copy behind message keys", () => {
    const violations = scanRoots.flatMap(sourceFiles).flatMap((filePath) => {
      const relative = path.relative(process.cwd(), filePath)
      return readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .flatMap((line, index) => {
          const matches = rawCopyPatterns.filter(({ pattern }) => pattern.test(line))
          return matches.map(({ label }) => `${relative}:${index + 1}: ${label}: ${line.trim()}`)
        })
    })

    expect(violations).toEqual([])
  })
})
