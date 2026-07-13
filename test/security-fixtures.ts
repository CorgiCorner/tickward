import { createHash } from "node:crypto"

export function syntheticSecret(label: string, prefix = "fixture") {
  const value = createHash("sha256").update(`test-fixture:${label}`, "utf8").digest("hex")
  return `${prefix}_${value}`
}
