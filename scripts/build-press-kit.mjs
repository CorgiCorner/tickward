#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveTrustedExecutable } from "./trusted-executable.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const pressDir = path.join(rootDir, "public", "press")
const zipPath = path.join(pressDir, "tickward-press-kit.zip")

// Keep this list explicit so the zip never swallows itself or strays.
const assets = [
  "tickward-logo-512.png",
  "tickward-logo-256.png",
  "screenshot-timers-light.png",
  "screenshot-timers-dark.png",
  "boilerplate.txt",
]

function log(message) {
  process.stdout.write(`[press:kit] ${message}\n`)
}

for (const asset of assets) {
  const assetPath = path.join(pressDir, asset)
  if (!existsSync(assetPath)) {
    console.error(`[press:kit] missing asset: ${path.relative(rootDir, assetPath)}`)
    process.exit(1)
  }
}

rmSync(zipPath, { force: true })
// -X drops platform extra fields, -j flattens paths inside the archive.
const zipExecutable = resolveTrustedExecutable("zip", {
  candidates: ["/usr/bin/zip", "/bin/zip", "/usr/local/bin/zip", "/opt/homebrew/bin/zip"],
})
execFileSync(zipExecutable, ["-X", "-j", zipPath, ...assets.map((asset) => path.join(pressDir, asset))], {
  stdio: "inherit",
})

const size = statSync(zipPath).size
log(`wrote ${path.relative(rootDir, zipPath)} (${Math.round(size / 1024)} KB, ${assets.length} files)`)
