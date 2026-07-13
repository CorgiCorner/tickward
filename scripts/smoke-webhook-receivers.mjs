import { createHmac, randomBytes } from "node:crypto"
import { once } from "node:events"
import net from "node:net"
import { spawn, spawnSync } from "node:child_process"

const secret = randomBytes(32).toString("hex")
const invalidSecret = randomBytes(32).toString("hex")
const payload = JSON.stringify({
  object: "event",
  id: "evt_%j_smoke",
  type: "webhook.%s.test",
  created: "2026-06-10T12:00:00.000Z",
  environment: "test",
  event_version: "2026-06-10",
  data: { object: { id: "wh_smoke", object: "webhook_endpoint", message: "Smoke test" } },
})

function signatureFor(body, key = secret) {
  const timestamp = Math.floor(Date.now() / 1000)
  const digest = createHmac("sha256", key).update(`${timestamp}.${body}`, "utf8").digest("hex")
  return `t=${timestamp},v1=${digest}`
}

async function freePort() {
  const server = net.createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  server.close()
  await once(server, "close")
  if (!address || typeof address === "string") throw new Error("Could not allocate a local port")
  return address.port
}

async function waitForPort(port) {
  const started = Date.now()
  while (Date.now() - started < 5_000) {
    const socket = net.connect(port, "127.0.0.1")
    try {
      await Promise.race([
        once(socket, "connect"),
        once(socket, "error").then(([error]) => {
          throw error
        }),
      ])
      socket.destroy()
      return
    } catch {
      socket.destroy()
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`Timed out waiting for receiver on port ${port}`)
}

async function post(port, signature) {
  return fetch(`http://127.0.0.1:${port}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tickward-signature": signature,
    },
    body: payload,
  })
}

async function smokeReceiver(name, command, args) {
  const port = await freePort()
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), TICKWARD_WEBHOOK_SECRET: secret },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    output += chunk.toString()
  })

  try {
    await waitForPort(port)

    const valid = await post(port, signatureFor(payload))
    if (valid.status !== 200) throw new Error(`${name} rejected a valid signature with ${valid.status}\n${output}`)
    if (!output.includes("[tickward] webhook received") || !output.includes("webhook.%s.test")) {
      throw new Error(`${name} did not emit constant-structure event metadata\n${output}`)
    }

    const invalid = await post(port, signatureFor(payload, invalidSecret))
    if (invalid.status !== 401) throw new Error(`${name} accepted an invalid signature with ${invalid.status}`)

    console.log(`${name}: ok`)
  } finally {
    child.kill("SIGTERM")
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 1_000))])
  }
}

async function rejectsUnsafeBinding(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "0.0.0.0",
      PORT: "0",
      TICKWARD_WEBHOOK_SECRET: secret,
      TICKWARD_TLS_TERMINATED: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    output += chunk.toString()
  })

  let timeout
  const [code] = await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => {
      timeout = setTimeout(() => {
        child.kill("SIGTERM")
        resolve([null])
      }, 5_000)
    }),
  ])
  clearTimeout(timeout)
  if (code === 0 || !output.includes("Refusing a non-loopback HTTP listener")) {
    throw new Error(`${name} did not reject an unsafe public HTTP binding\n${output}`)
  }
}

function commandAvailable(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0
}

await smokeReceiver("node receiver", process.execPath, ["examples/webhook-receivers/node/server.mjs"])
await rejectsUnsafeBinding("node receiver", process.execPath, ["examples/webhook-receivers/node/server.mjs"])

if (commandAvailable("python3")) {
  await smokeReceiver("python receiver", "python3", ["examples/webhook-receivers/python/receiver.py"])
  await rejectsUnsafeBinding("python receiver", "python3", ["examples/webhook-receivers/python/receiver.py"])
} else {
  console.warn("python receiver: skipped, python3 not found")
}
