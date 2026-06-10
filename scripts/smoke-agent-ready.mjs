#!/usr/bin/env node
import { chromium } from "playwright"

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

function parseScore(text) {
  const escapedSite = expectedSiteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const resultPattern = new RegExp(`RESULTS FOR\\s+${escapedSite}\\s+(\\d+)\\s+LEVEL`, "i")
  const resultMatch = text.match(resultPattern)
  if (resultMatch) return Number(resultMatch[1])

  const fallbackMatch = text.match(/\b(\d{1,3})\s+LEVEL\s+\d+\b/i)
  return fallbackMatch ? Number(fallbackMatch[1]) : null
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(timeoutMs)

try {
  log(`opening ${agentReadyUrl}`)
  await page.goto(agentReadyUrl, { waitUntil: "networkidle", timeout: timeoutMs })
  await page.getByText("RESULTS FOR").waitFor({ timeout: timeoutMs })
  const bodyText = await page.locator("body").innerText({ timeout: timeoutMs })

  if (!bodyText.includes(expectedSiteUrl)) {
    fail(`Expected scanner result for ${expectedSiteUrl}`)
  }

  const score = parseScore(bodyText)
  if (score === null || Number.isNaN(score)) {
    fail("Could not read the Agent Ready score")
  }

  if (score < minScore) {
    fail(`Agent Ready score is ${score}; expected at least ${minScore}`)
  }

  log(`score ${score}/${minScore}`)
} finally {
  await browser.close()
}
