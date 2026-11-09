#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** @typedef {{packageName: string, version: string, advisoryUrl: string, severity: string, expiresAt: string}} AdvisoryException */
/** @type {Readonly<AdvisoryException>} */
export const developmentAdvisoryException = Object.freeze({
  packageName: "braces",
  version: "3.0.3",
  advisoryUrl: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
  // Approved on 2026-10-16 through the end of 2026 in Europe/Warsaw.
  expiresAt: "2026-12-31T23:00:00.000Z",
})

const severities = ["info", "low", "moderate", "high", "critical"]
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

function requireValid(condition, message) {
  if (!condition) throw new Error(message)
}

function validateInputs(report, lock, exitStatus) {
  requireValid(record(report) && report.auditReportVersion === 2 && !report.error, "Unsupported audit report")
  requireValid(record(lock) && lock.lockfileVersion === 3 && record(lock.packages), "Unsupported lockfile")
  requireValid(record(report.vulnerabilities), "Missing vulnerability records")
  const counts = Object.fromEntries([...severities, "total"].map((name) => [name, 0]))
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    requireValid(
      record(item) && item.name === name && severities.includes(item.severity),
      "Invalid vulnerability record",
    )
    requireValid(Array.isArray(item.nodes) && item.nodes.length > 0, `Missing audit nodes: ${name}`)
    requireValid(new Set(item.nodes).size === item.nodes.length, `Duplicate audit nodes: ${name}`)
    for (const node of item.nodes) {
      requireValid(
        typeof node === "string" &&
          node.startsWith("node_modules/") &&
          !node.split("/").includes("..") &&
          (node === `node_modules/${name}` || node.endsWith(`/node_modules/${name}`)),
        `Invalid audit node: ${name}`,
      )
      requireValid(
        record(lock.packages[node]) && typeof lock.packages[node].version === "string",
        `Audit/lockfile mismatch: ${name}`,
      )
    }
    requireValid(Array.isArray(item.via) && item.via.length > 0, `Missing advisory chain: ${name}`)
    for (const via of item.via) {
      if (typeof via === "string") {
        requireValid(Object.hasOwn(report.vulnerabilities, via), `Unresolved advisory chain: ${name}`)
        requireValid(
          severities.indexOf(item.severity) >= severities.indexOf(report.vulnerabilities[via].severity),
          `Understated advisory severity: ${name}`,
        )
      } else {
        requireValid(
          record(via) &&
            typeof via.name === "string" &&
            typeof via.dependency === "string" &&
            typeof via.url === "string" &&
            typeof via.range === "string" &&
            severities.includes(via.severity),
          `Invalid advisory leaf: ${name}`,
        )
        requireValid(
          severities.indexOf(item.severity) >= severities.indexOf(via.severity),
          `Understated advisory severity: ${name}`,
        )
      }
    }
    counts[item.severity] += 1
    counts.total += 1
  }
  const reportedCounts = report.metadata?.vulnerabilities
  requireValid(record(reportedCounts), "Missing audit counts")
  for (const [name, count] of Object.entries(counts)) {
    requireValid(reportedCounts[name] === count, "Inconsistent audit counts")
  }
  const expectedExit = counts.high + counts.critical > 0 ? 1 : 0
  requireValid(exitStatus === expectedExit, "Unexpected npm audit exit status")
  return counts
}

function approvedChain(name, report, lock, exception, visiting = new Set()) {
  // A cycle cannot qualify for an exception. Below-threshold npm cycles keep
  // their normal treatment; they are never used as evidence for an allowance.
  if (visiting.has(name)) return false
  const item = report.vulnerabilities[name]
  if (item.severity !== exception.severity) return false
  const lockedNodes = Object.entries(lock.packages)
    .filter(([node]) => node === `node_modules/${name}` || node.endsWith(`/node_modules/${name}`))
    .map(([node]) => node)
  if (lockedNodes.length !== item.nodes.length || lockedNodes.some((node) => !item.nodes.includes(node))) return false
  if (item.nodes.some((node) => lock.packages[node].dev !== true)) return false
  if (name === exception.packageName && item.nodes.some((node) => lock.packages[node].version !== exception.version))
    return false
  const nextVisiting = new Set([...visiting, name])
  return item.via.every((via) => {
    if (typeof via === "string") return approvedChain(via, report, lock, exception, nextVisiting)
    return (
      via.name === exception.packageName &&
      via.dependency === exception.packageName &&
      name === exception.packageName &&
      via.url === exception.advisoryUrl &&
      via.severity === exception.severity
    )
  })
}

export function evaluateDependencyAudit({
  report,
  lock,
  exitStatus,
  now = Date.now(),
  exception = developmentAdvisoryException,
}) {
  const expires = Date.parse(exception.expiresAt)
  requireValid(
    Number.isFinite(expires) && new Date(expires).toISOString() === exception.expiresAt,
    "Invalid exception expiry",
  )
  requireValid(Number.isFinite(now), "Invalid audit clock")
  const counts = validateInputs(report, lock, exitStatus)
  const exempted = []
  const blocked = []
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    if (!["high", "critical"].includes(item.severity)) continue
    if (now < expires && approvedChain(name, report, lock, exception)) exempted.push(name)
    else blocked.push(name)
  }
  return { passed: blocked.length === 0, counts, exempted, blocked, exceptionExpiresAt: exception.expiresAt }
}

/**
 * @param {{root?: string, execute?: (command: string, args: string[], options: object) => {status: number|null, stdout: string, error?: Error, signal?: string|null}, now?: number, exception?: AdvisoryException}} options
 */
export function auditDependencies({
  root = process.cwd(),
  execute = spawnSync,
  now,
  exception = developmentAdvisoryException,
} = {}) {
  const lockPath = path.join(root, "package-lock.json")
  const before = readFileSync(lockPath)
  const lock = JSON.parse(before.toString("utf8"))
  const result = execute(
    "npm",
    [
      "audit",
      "--json",
      "--audit-level=high",
      "--package-lock-only",
      "--include=dev",
      "--include=optional",
      "--include=peer",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  )
  requireValid(!result.error && !result.signal && [0, 1].includes(result.status), "npm audit did not complete normally")
  requireValid(before.equals(readFileSync(lockPath)), "Lockfile changed during audit")
  const report = JSON.parse(result.stdout)
  return {
    ...evaluateDependencyAudit({ report, lock, exitStatus: result.status, now, exception }),
    lockfileSha256: createHash("sha256").update(before).digest("hex"),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireValid(process.argv.length === 2, "Dependency audit does not accept command-line overrides")
    const result = auditDependencies()
    console.log(
      `Dependency audit: ${result.counts.high} high, ${result.counts.critical} critical, ${result.counts.moderate} moderate package findings.`,
    )
    console.log(`Audited lockfile SHA-256: ${result.lockfileSha256}`)
    if (result.exempted.length > 0) {
      console.log(
        `Approved development-only ${developmentAdvisoryException.packageName}@${developmentAdvisoryException.version}: ${developmentAdvisoryException.advisoryUrl}`,
      )
      console.log(
        `Exception expires ${result.exceptionExpiresAt}; ${result.exempted.length} propagated package findings covered.`,
      )
    }
    if (!result.passed) console.error(`Unapproved high/critical findings: ${result.blocked.join(", ")}`)
    process.exitCode = result.passed ? 0 : 1
  } catch (error) {
    console.error(`Dependency audit failed: ${error instanceof Error ? error.message : "invalid audit result"}`)
    process.exitCode = 1
  }
}
