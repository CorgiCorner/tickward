// Minimal tickward webhook receiver for Node.js 18+ (no dependencies).
// Usage: set TICKWARD_WEBHOOK_SECRET, then run `node server.mjs`.
// Production: terminate HTTPS at a trusted reverse proxy; never expose this HTTP listener directly.

import { createHmac, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"

const SECRET = process.env.TICKWARD_WEBHOOK_SECRET ?? ""
const HOST = process.env.HOST ?? "127.0.0.1"
const PORT = Number(process.env.PORT ?? 8787)
const MAX_AGE_SECONDS = 300
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"])

if (!LOOPBACK_HOSTS.has(HOST) && process.env.TICKWARD_TLS_TERMINATED !== "true") {
  throw new Error(
    "Refusing a non-loopback HTTP listener. Terminate TLS at a trusted reverse proxy and set TICKWARD_TLS_TERMINATED=true.",
  )
}

function verifySignature(header, rawBody) {
  const timestamp = (header.split(",")[0] ?? "").replace("t=", "")
  const expected = (header.split(",")[1] ?? "").replace("v1=", "")
  if (!timestamp || !expected) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false

  const computed = createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")
  const a = Buffer.from(computed, "utf8")
  const b = Buffer.from(expected, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

const server = createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end()
    return
  }

  const chunks = []
  req.on("data", (chunk) => chunks.push(chunk))
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8")
    const header = String(req.headers["tickward-signature"] ?? "")

    if (!verifySignature(header, rawBody)) {
      res.writeHead(401).end("invalid signature")
      return
    }

    const event = JSON.parse(rawBody)
    console.log("[tickward] webhook received", {
      type: event.type,
      id: event.id,
      object: event.data.object,
    })
    // Handle the event here. Keep it idempotent - deliveries can retry.

    res.writeHead(200).end("ok")
  })
})

server.listen(PORT, HOST, () => console.log("[tickward] receiver listening", { host: HOST, port: PORT }))
