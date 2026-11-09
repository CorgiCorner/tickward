import { describe, expect, it } from "vitest"

import { developmentAdvisoryException, evaluateDependencyAudit } from "./dependency-audit.mjs"

const exception = { ...developmentAdvisoryException, advisoryUrl: "https://example.com/advisories/approved" }
const now = Date.parse("2026-10-16T12:00:00.000Z")
const leaf = (name = "braces", url = exception.advisoryUrl, severity = "high") => ({
  name,
  dependency: name,
  url,
  severity,
  range: "<=3.0.3",
})
const item = (name: string, via: (string | ReturnType<typeof leaf>)[], severity = "high") => ({
  name,
  severity,
  via,
  nodes: [`node_modules/${name}`],
})

function fixture() {
  return {
    report: {
      auditReportVersion: 2,
      vulnerabilities: {
        braces: item("braces", [leaf()]),
        matcher: item("matcher", ["braces"]),
      } as Record<string, ReturnType<typeof item>>,
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 } },
    },
    lock: {
      lockfileVersion: 3,
      packages: {
        "node_modules/braces": { version: "3.0.3", dev: true },
        "node_modules/matcher": { version: "1.0.0", dev: true },
      } as Record<string, { version: string; dev?: boolean; devOptional?: boolean }>,
    },
    exitStatus: 1,
    now,
    exception,
  }
}

function recount(f: ReturnType<typeof fixture>) {
  const counts: Record<string, number> = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
  for (const v of Object.values(f.report.vulnerabilities)) {
    counts[v.severity] += 1
    counts.total += 1
  }
  Object.assign(f.report.metadata.vulnerabilities, counts)
  f.exitStatus = counts.high + counts.critical > 0 ? 1 : 0
}

describe("dependency audit exception", () => {
  it("pins the approved package and expires at the end of the local calendar year", () => {
    expect(developmentAdvisoryException.packageName).toBe("braces")
    expect(developmentAdvisoryException.version).toBe("3.0.3")
    expect(developmentAdvisoryException.advisoryUrl.endsWith("/GHSA-vfj7-8cjw-p6xm")).toBe(true)
    expect(developmentAdvisoryException.expiresAt).toBe("2026-12-31T23:00:00.000Z")
  })

  it("accepts only the exact advisory through a complete development-only chain", () => {
    expect(evaluateDependencyAudit(fixture())).toMatchObject({
      passed: true,
      exempted: ["braces", "matcher"],
      blocked: [],
    })
  })

  it.each([false, undefined])("blocks a production or unclassified braces occurrence: dev=%s", (dev) => {
    const f = fixture()
    f.lock.packages["node_modules/braces"].dev = dev
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it("blocks a production parent even if the leaf is development-only", () => {
    const f = fixture()
    f.lock.packages["node_modules/matcher"].dev = false
    expect(evaluateDependencyAudit(f).blocked).toEqual(["matcher"])
  })

  it("does not treat an optional development occurrence as strictly development-only", () => {
    const f = fixture()
    delete f.lock.packages["node_modules/braces"].dev
    f.lock.packages["node_modules/braces"].devOptional = true
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it.each(["3.0.2", "3.0.4"])("rejects an unapproved affected version %s", (version) => {
    const f = fixture()
    f.lock.packages["node_modules/braces"].version = version
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it("rejects a hidden second occurrence that is absent from the audit nodes", () => {
    const f = fixture()
    f.lock.packages["node_modules/other/node_modules/braces"] = { version: "3.0.3", dev: false }
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it("checks every occurrence when npm reports multiple copies", () => {
    const f = fixture()
    const node = "node_modules/other/node_modules/braces"
    f.lock.packages[node] = { version: "3.0.3", dev: true }
    f.report.vulnerabilities.braces.nodes.push(node)
    expect(evaluateDependencyAudit(f).passed).toBe(true)
    f.lock.packages[node].version = "3.0.2"
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it("does not allowlist a package containing another advisory", () => {
    const f = fixture()
    f.report.vulnerabilities.braces.via.push(leaf("braces", "https://example.com/advisories/another"))
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it("does not allowlist parents with another advisory leaf", () => {
    const f = fixture()
    f.report.vulnerabilities.matcher.via.push(leaf("matcher", "https://example.com/advisories/another"))
    expect(evaluateDependencyAudit(f).blocked).toEqual(["matcher"])
  })

  it("blocks an independent high advisory", () => {
    const f = fixture()
    f.report.vulnerabilities.other = item("other", [leaf("other")])
    f.lock.packages["node_modules/other"] = { version: "1.0.0", dev: true }
    recount(f)
    expect(evaluateDependencyAudit(f).blocked).toEqual(["other"])
  })

  it("does not extend the approval to critical severity", () => {
    const f = fixture()
    f.report.vulnerabilities.braces.severity = "critical"
    f.report.vulnerabilities.matcher.severity = "critical"
    recount(f)
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it.each(["high", "moderate"])("rejects a critical leaf understated as %s", (severity) => {
    const f = fixture()
    f.report.vulnerabilities.braces.severity = severity
    f.report.vulnerabilities.matcher.severity = severity
    f.report.vulnerabilities.braces.via = [leaf("braces", exception.advisoryUrl, "critical")]
    f.lock.packages["node_modules/braces"].dev = false
    recount(f)
    expect(() => evaluateDependencyAudit(f)).toThrow("Understated advisory severity")
  })

  it("rejects a parent whose reported severity understates a referenced child", () => {
    const f = fixture()
    f.report.vulnerabilities.matcher.severity = "moderate"
    recount(f)
    expect(() => evaluateDependencyAudit(f)).toThrow("Understated advisory severity")
  })

  it("rejects cycles in chains claiming an exception, even with an approved leaf", () => {
    const f = fixture()
    f.report.vulnerabilities.matcher.via.push("matcher")
    expect(evaluateDependencyAudit(f).blocked).toEqual(["matcher"])
  })

  it("preserves normal below-threshold treatment for npm's moderate cycles", () => {
    const f = fixture()
    f.report.vulnerabilities.one = item(
      "one",
      ["two", leaf("one", "https://example.com/advisories/moderate", "moderate")],
      "moderate",
    )
    f.report.vulnerabilities.two = item("two", ["one"], "moderate")
    for (const name of ["one", "two"]) f.lock.packages[`node_modules/${name}`] = { version: "1.0.0", dev: false }
    recount(f)
    expect(evaluateDependencyAudit(f)).toMatchObject({ passed: true, counts: { moderate: 2 } })
  })

  it("passes an audit without high findings without using an exception", () => {
    const f = fixture()
    f.report.vulnerabilities = {}
    recount(f)
    expect(evaluateDependencyAudit(f)).toMatchObject({ passed: true, exempted: [] })
  })

  it("expires exactly at local midnight, regardless of the process timezone", () => {
    const f = fixture()
    f.now = Date.parse(exception.expiresAt) - 1
    expect(evaluateDependencyAudit(f).passed).toBe(true)
    f.now += 1
    expect(evaluateDependencyAudit(f).passed).toBe(false)
  })

  it.each(["invalid", "2026-02-31T23:00:00.000Z"])("rejects an invalid expiry: %s", (expiresAt) => {
    const f = fixture()
    f.exception = { ...exception, expiresAt }
    expect(() => evaluateDependencyAudit(f)).toThrow("Invalid exception expiry")
  })

  it("rejects an invalid clock", () => {
    const f = fixture()
    f.now = NaN
    expect(() => evaluateDependencyAudit(f)).toThrow("Invalid audit clock")
  })

  it.each([2, null, 0])("rejects an unexpected npm process exit %s", (exitStatus) => {
    expect(() => evaluateDependencyAudit({ ...fixture(), exitStatus })).toThrow("Unexpected npm audit exit status")
  })

  it.each([
    [
      "unsupported report",
      (f: ReturnType<typeof fixture>) => {
        f.report.auditReportVersion = 3
      },
    ],
    [
      "unsupported lock",
      (f: ReturnType<typeof fixture>) => {
        f.lock.lockfileVersion = 2
      },
    ],
    [
      "missing locked node",
      (f: ReturnType<typeof fixture>) => {
        delete f.lock.packages["node_modules/braces"]
      },
    ],
    [
      "missing version",
      (f: ReturnType<typeof fixture>) => {
        Reflect.deleteProperty(f.lock.packages["node_modules/braces"], "version")
      },
    ],
    [
      "unresolved chain",
      (f: ReturnType<typeof fixture>) => {
        f.report.vulnerabilities.matcher.via.push("missing")
      },
    ],
    [
      "empty chain",
      (f: ReturnType<typeof fixture>) => {
        f.report.vulnerabilities.matcher.via = []
      },
    ],
    [
      "empty nodes",
      (f: ReturnType<typeof fixture>) => {
        f.report.vulnerabilities.matcher.nodes = []
      },
    ],
    [
      "duplicate nodes",
      (f: ReturnType<typeof fixture>) => {
        f.report.vulnerabilities.matcher.nodes.push("node_modules/matcher")
      },
    ],
    [
      "invalid severity",
      (f: ReturnType<typeof fixture>) => {
        f.report.vulnerabilities.matcher.severity = "unknown"
      },
    ],
    [
      "inconsistent counts",
      (f: ReturnType<typeof fixture>) => {
        f.report.metadata.vulnerabilities.high = 1
      },
    ],
    [
      "mismatched package name",
      (f: ReturnType<typeof fixture>) => {
        f.report.vulnerabilities.matcher.name = "other"
      },
    ],
    [
      "invalid node path",
      (f: ReturnType<typeof fixture>) => {
        f.report.vulnerabilities.matcher.nodes = ["../node_modules/matcher"]
      },
    ],
  ])("fails closed on %s", (_name, mutate) => {
    const f = fixture()
    mutate(f)
    expect(() => evaluateDependencyAudit(f)).toThrow()
  })
})
