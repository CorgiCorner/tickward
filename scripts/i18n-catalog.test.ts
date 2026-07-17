import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { MESSAGES, type MessageKey } from "@/lib/i18n/messages"

const localeDir = path.join(process.cwd(), "lib/i18n/locales")
const sourceRoots = ["app", "components", "lib", "scripts"].map((root) => path.join(process.cwd(), root))

const adapterLocaleDir = ["scripts", ["public", "overrides"].join("-"), "lib/i18n/locales"].join("/")
const skippedDirs = [
  "components/storybook",
  "lib/generated",
  "lib/i18n/locales",
  "node_modules",
  adapterLocaleDir,
  "storybook-static",
]
const skippedFilePatterns = [/\.stories\.[cm]?[tj]sx?$/, /\.test\.[cm]?[tj]sx?$/, /\.d\.ts$/]
const checkedExtensions = new Set([".ts", ".tsx"])
const dynamicMessageKeys = new Set([
  "apiKeys.lastUsedLabel",
  "app.og.badge.event",
  "app.og.badge.meeting",
  "app.og.badge.vacation",
  "app.og.openSource",
  "app.og.subtitle",
  "auth.description.accountSignInRequired",
  "auth.profileDescription",
  "footer.dataPolicy.overLimit.many",
  "footer.dataPolicy.overLimit.one",
  "footer.dataPolicy.unclaimed.many",
  "footer.dataPolicy.unclaimed.one",
])
const publicMirrorOptionalMessageKeys = new Set([
  "errors.authNotConfigured",
  "errors.webPushDatabaseRequired",
  "webPush.incompleteSubscription",
  "webPush.persistFailed",
])

function isCountUpMessageKey(key: string) {
  return key.startsWith("countUp.") || key.startsWith("settings.countUp.") || key.startsWith("validation.countUp")
}

function isPublicMirror() {
  const boundaryManifest = ["public", "allowlist"].join("-") + ".txt"
  return !existsSync(path.join(process.cwd(), "scripts", boundaryManifest))
}

function relativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/")
}

function shouldSkip(filePath: string) {
  const relative = relativePath(filePath)
  return (
    skippedDirs.some((dir) => relative === dir || relative.startsWith(`${dir}/`)) ||
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

function localeFiles(dir = localeDir) {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => path.join(dir, entry))
}

function localeSourceKeys(filePath: string) {
  return [...readFileSync(filePath, "utf8").matchAll(/^\s*["']([^"']+)["']\s*:/gm)].map((match) => match[1])
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort()
}

function directFormatMessageKeys(filePath: string) {
  const source = readFileSync(filePath, "utf8")
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const keys: string[] = []

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === "formatMessage") {
      const [key] = node.arguments
      if (key && ts.isStringLiteral(key)) keys.push(key.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return keys
}

function countUpSourceMessages(filePath: string) {
  const source = readFileSync(filePath, "utf8")
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const messages: Array<{ key: string; value: string }> = []

  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isStringLiteral(node.name) ? node.name.text : null
      const value = ts.isStringLiteralLike(node.initializer) ? node.initializer.text : null
      if (key && value !== null && isCountUpMessageKey(key)) messages.push({ key, value })
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return messages
}

describe("i18n catalog", () => {
  it("does not duplicate message keys in locale source files", () => {
    const violations = localeFiles().flatMap((filePath) => {
      const duplicates = duplicateValues(localeSourceKeys(filePath))
      return duplicates.map((key) => `${relativePath(filePath)}: duplicate key ${key}`)
    })

    expect(violations).toEqual([])
  })

  it("keeps every locale catalog aligned with the default English catalog", () => {
    const defaultKeys = Object.keys(MESSAGES.en).sort()
    const violations = Object.entries(MESSAGES).flatMap(([locale, messages]) => {
      const keys = Object.keys(messages).sort()
      const missing = defaultKeys.filter((key) => !keys.includes(key))
      const extra = keys.filter((key) => !defaultKeys.includes(key))
      return [...missing.map((key) => `${locale}: missing ${key}`), ...extra.map((key) => `${locale}: extra ${key}`)]
    })

    expect(violations).toEqual([])
  })

  it("keeps direct formatMessage keys resolvable", () => {
    const messageKeys = new Set<MessageKey>(Object.keys(MESSAGES.en) as MessageKey[])
    const violations = sourceRoots.flatMap(sourceFiles).flatMap((filePath) =>
      directFormatMessageKeys(filePath)
        .filter((key) => !messageKeys.has(key as MessageKey))
        .map((key) => `${relativePath(filePath)}: unknown message key ${key}`),
    )

    expect(violations).toEqual([])
  })

  it("keeps English messages non-empty", () => {
    const violations = Object.entries(MESSAGES.en)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => `en: empty ${key}`)

    expect(violations).toEqual([])
  })

  it("keeps legacy Seen terminology out of user-facing count-up messages", () => {
    const adapterPath = path.join(process.cwd(), adapterLocaleDir)
    const catalogs = [...localeFiles(), ...(existsSync(adapterPath) ? localeFiles(adapterPath) : [])]
    const firstShownHelperKeys = new Set(["settings.countUp.helperTimed", "settings.countUp.helperTimedSingular"])
    const violations = catalogs.flatMap((filePath) =>
      countUpSourceMessages(filePath)
        .filter(({ key, value }) => /\bseen\b/i.test(value) && !firstShownHelperKeys.has(key))
        .map(({ key }) => `${relativePath(filePath)}: count-up message ${key} uses Seen`),
    )

    expect(violations).toEqual([])
  })

  it("keeps English message keys referenced by the source tree", () => {
    const source = sourceRoots
      .flatMap(sourceFiles)
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n")
    const violations = Object.keys(MESSAGES.en)
      .filter((key) => !source.includes(key))
      .filter((key) => !dynamicMessageKeys.has(key))
      .filter((key) => !(isPublicMirror() && publicMirrorOptionalMessageKeys.has(key)))
      .map((key) => `en: unused ${key}`)

    expect(violations).toEqual([])
  })
})
