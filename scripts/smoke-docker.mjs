#!/usr/bin/env node
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const host = "127.0.0.1"
const timeoutMs = Number(process.env.SMOKE_DOCKER_TIMEOUT_MS ?? 120_000)
const projectName = process.env.SMOKE_DOCKER_PROJECT ?? `tickward-smoke-${process.pid}-${Date.now().toString(36)}`

function log(message) {
  process.stdout.write(`[smoke:docker] ${message}\n`)
}

function fail(message) {
  throw new Error(message)
}

async function findFreePort() {
  const server = createServer()
  server.listen(0, host)
  await once(server, "listening")
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : null
  server.close()
  await once(server, "close")
  if (!port) fail("Could not allocate a local port")
  return port
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
    })
  })
}

function capture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output)
        return
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}\n${output}`))
    })
  })
}

async function waitForHttp(url) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {}
    await delay(750)
  }
  fail(`Timed out waiting for ${url}`)
}

async function expectStatus(url, expectedStatus, options = {}) {
  const response = await fetch(url, options)
  if (response.status !== expectedStatus) {
    const body = await response.text().catch(() => "")
    fail(`Expected ${expectedStatus} from ${url}, got ${response.status}: ${body.slice(0, 500)}`)
  }
  return response
}

async function runChecks(baseUrl, env) {
  await waitForHttp(baseUrl)
  log(`home is reachable at ${baseUrl}`)

  const capabilities = await expectStatus(`${baseUrl}/api/v1/capabilities`, 200)
  const capabilitiesBody = await capabilities.json()
  if (capabilitiesBody?.object !== "capabilities") {
    fail(`Unexpected capabilities response: ${JSON.stringify(capabilitiesBody).slice(0, 500)}`)
  }
  log("public API capabilities responded")

  const docs = await expectStatus(`${baseUrl}/docs`, 307, { redirect: "manual" })
  const docsLocation = docs.headers.get("location")
  if (docsLocation !== "https://tickward.com/docs") {
    fail(`Unexpected /docs redirect: ${docsLocation}`)
  }

  const docsGuide = await expectStatus(`${baseUrl}/docs/guides/api-quickstart`, 307, { redirect: "manual" })
  const docsGuideLocation = docsGuide.headers.get("location")
  if (docsGuideLocation !== "https://tickward.com/docs/guides/api-quickstart") {
    fail(`Unexpected docs guide redirect: ${docsGuideLocation}`)
  }
  log("docs redirects are configured")

  await run("npm", ["run", "smoke:app"], {
    env: {
      ...env,
      SMOKE_BASE_URL: baseUrl,
    },
  })
  log("browser smoke passed against Docker")
}

async function dockerLogs(env) {
  try {
    const output = await capture(
      "docker",
      ["compose", "--env-file", ".env.example", "-p", projectName, "logs", "--no-color", "--tail=160"],
      { env },
    )
    if (output.trim()) process.stderr.write(`${output}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
  }
}

async function main() {
  await run("docker", ["compose", "version"], { stdio: "ignore" })

  const port = process.env.SMOKE_DOCKER_PORT ?? String(await findFreePort())
  const baseUrl = `http://${host}:${port}`
  const env = {
    APP_PORT: port,
    NEXT_TELEMETRY_DISABLED: "1",
  }
  const composeArgs = ["compose", "--env-file", ".env.example", "-p", projectName]
  let failed = false

  try {
    log(`building and starting ${projectName} on ${baseUrl}`)
    await run("docker", [...composeArgs, "up", "--build", "-d"], { env })
    await runChecks(baseUrl, env)
    log("passed")
  } catch (error) {
    failed = true
    process.stderr.write(`${error.stack ?? error.message}\n`)
    await dockerLogs(env)
    process.exitCode = 1
  } finally {
    log(`stopping ${projectName}`)
    try {
      await run("docker", [...composeArgs, "down", "-v", "--remove-orphans"], { env })
    } catch (error) {
      failed = true
      process.stderr.write(`${error.stack ?? error.message}\n`)
      process.exitCode = 1
    }
  }

  if (failed) process.exitCode = 1
}

await main()
