#!/usr/bin/env node
import { pathToFileURL } from "node:url"

const agentReadyUrl = process.env.AGENT_READY_URL ?? "https://isitagentready.com/tickward.com?profile=apiApp"
const expectedSiteUrl = process.env.AGENT_READY_SITE_URL ?? "https://tickward.com"
const minScore = Number(process.env.AGENT_READY_MIN_SCORE ?? 100)
const timeoutMs = Number(process.env.AGENT_READY_TIMEOUT_MS ?? 60_000)

function log(message) {
  process.stdout.write(`[smoke:agent-ready] ${message}\n`)
}

function fail(message) {
  throw new Error(message)
}

function normalizeHttpUrl(value) {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(`Expected an HTTP(S) site URL, received ${url.protocol}`)
  }
  url.hash = ""
  return url.href
}

export function parseAgentReadyScore(text, siteUrl) {
  const expectedUrl = normalizeHttpUrl(siteUrl)
  const tokens = text.trim().split(/\s+/)

  for (let index = 0; index <= tokens.length - 5; index += 1) {
    if (tokens[index]?.toUpperCase() !== "RESULTS" || tokens[index + 1]?.toUpperCase() !== "FOR") continue

    let resultUrl
    try {
      resultUrl = normalizeHttpUrl(tokens[index + 2])
    } catch {
      continue
    }
    if (resultUrl !== expectedUrl || tokens[index + 4]?.toUpperCase() !== "LEVEL") continue

    const score = Number(tokens[index + 3])
    return Number.isInteger(score) && score >= 0 ? score : null
  }

  return null
}

async function main() {
  const { chromium } = await import("playwright")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(timeoutMs)

  try {
    log(`opening ${agentReadyUrl}`)
    await page.goto(agentReadyUrl, { waitUntil: "networkidle", timeout: timeoutMs })
    await page.getByText("RESULTS FOR").waitFor({ timeout: timeoutMs })
    const bodyText = await page.locator("body").innerText({ timeout: timeoutMs })

    const score = parseAgentReadyScore(bodyText, expectedSiteUrl)
    if (score === null) {
      fail(`Could not read the Agent Ready score for ${normalizeHttpUrl(expectedSiteUrl)}`)
    }

    if (score < minScore) {
      fail(`Agent Ready score is ${score}; expected at least ${minScore}`)
    }

    log(`score ${score}/${minScore}`)
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
