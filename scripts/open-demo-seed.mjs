import { spawn } from "node:child_process"
import { resolveTrustedExecutable } from "./trusted-executable.mjs"

const url = process.env.TICKWARD_DEMO_URL ?? "http://localhost:3000/demo"

if (process.platform === "darwin" && !process.env.CI) {
  const openExecutable = resolveTrustedExecutable("open", { candidates: ["/usr/bin/open"] })
  const child = spawn(openExecutable, [url], {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
}

console.log(`Open ${url} to load the local demo project.`)
