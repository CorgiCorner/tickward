import { spawn } from "node:child_process"

const url = process.env.TICKWARD_DEMO_URL ?? "http://localhost:3000/demo"

if (process.platform === "darwin" && !process.env.CI) {
  const child = spawn("open", [url], {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
}

console.log(`Open ${url} to load the local demo project.`)
