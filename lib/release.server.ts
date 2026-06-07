import "server-only"

import packageJson from "@/package.json"

export function getPublicReleaseTag() {
  return `v${packageJson.version}`
}
