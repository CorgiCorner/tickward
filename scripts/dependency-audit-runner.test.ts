import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { auditDependencies, developmentAdvisoryException } from "./dependency-audit.mjs"

const roots: string[] = []
const exception = { ...developmentAdvisoryException, advisoryUrl: "https://example.com/advisories/approved" }
const now = Date.parse("2026-10-16T12:00:00.000Z")
const lock = { lockfileVersion: 3, packages: { "node_modules/braces": { version: "3.0.3", dev: true } } }
const report = {
  auditReportVersion: 2,
  vulnerabilities: {
    braces: {
      name: "braces",
      severity: "high",
      nodes: ["node_modules/braces"],
      via: [{ name: "braces", dependency: "braces", severity: "high", range: "<=3.0.3", url: exception.advisoryUrl }],
    },
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } },
}
const response = () => ({ status: 1, stdout: JSON.stringify(report), signal: null })
const makeRoot = (name = "dependency-audit-") => {
  const root = mkdtempSync(path.join(os.tmpdir(), name))
  roots.push(root)
  writeFileSync(path.join(root, "package-lock.json"), JSON.stringify(lock))
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("frozen dependency audit execution", () => {
  it.each(["private-audit-", "snapshot-audit-"])(
    "audits the exact lockfile in %s with the entire dependency tree",
    (name) => {
      const root = makeRoot(name)
      const execute = vi.fn(response)
      const result = auditDependencies({ root, execute, now, exception })
      expect(result.passed).toBe(true)
      expect(result.lockfileSha256).toBe(
        createHash("sha256")
          .update(readFileSync(path.join(root, "package-lock.json")))
          .digest("hex"),
      )
      expect(execute).toHaveBeenCalledWith(
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
        expect.objectContaining({ cwd: root, timeout: 120_000 }),
      )
    },
  )

  it("rejects lockfile drift while npm runs", () => {
    const root = makeRoot()
    const execute = () => {
      writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ ...lock, changed: true }))
      return response()
    }
    expect(() => auditDependencies({ root, execute, now, exception })).toThrow("Lockfile changed during audit")
  })

  it("checks the default clock after npm completes, including crossing expiry", () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.parse(exception.expiresAt) - 1)
      const execute = () => {
        vi.setSystemTime(Date.parse(exception.expiresAt))
        return response()
      }
      expect(auditDependencies({ root: makeRoot(), execute, exception }).passed).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects malformed npm output", () => {
    expect(() =>
      auditDependencies({ root: makeRoot(), execute: () => ({ status: 1, stdout: "invalid JSON" }), now, exception }),
    ).toThrow()
  })

  it.each([null, 2])("rejects transport/process failures with status %s", (status) => {
    expect(() =>
      auditDependencies({ root: makeRoot(), execute: () => ({ ...response(), status }), now, exception }),
    ).toThrow("npm audit did not complete normally")
  })

  it("rejects a timeout even if partial JSON resembles an approved result", () => {
    expect(() =>
      auditDependencies({
        root: makeRoot(),
        execute: () => ({ ...response(), error: new Error("timeout") }),
        now,
        exception,
      }),
    ).toThrow("npm audit did not complete normally")
  })

  it("rejects a signal even if npm supplied partial JSON", () => {
    expect(() =>
      auditDependencies({ root: makeRoot(), execute: () => ({ ...response(), signal: "SIGTERM" }), now, exception }),
    ).toThrow("npm audit did not complete normally")
  })

  it("requires a readable lockfile", () => {
    const root = makeRoot()
    rmSync(path.join(root, "package-lock.json"))
    const execute = vi.fn(response)
    expect(() => auditDependencies({ root, execute, now, exception })).toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
})
