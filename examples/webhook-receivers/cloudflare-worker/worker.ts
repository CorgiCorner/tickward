// tickward webhook receiver / verifying relay for Cloudflare Workers.
//
// Secrets/vars:
//   TICKWARD_WEBHOOK_SECRET - endpoint signing secret (wrangler secret put)
//   FORWARD_URL (optional)  - if set, valid requests are forwarded there with
//                             the original body. Useful as a verifying relay in
//                             front of platforms that cannot read headers,
//                             such as a "Webhooks by Zapier" hook URL.

type Env = {
  TICKWARD_WEBHOOK_SECRET: string
  FORWARD_URL?: string
}

const MAX_AGE_SECONDS = 300

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(header: string, rawBody: string, secret: string) {
  const timestamp = (header.split(",")[0] ?? "").replace("t=", "")
  const expected = (header.split(",")[1] ?? "").replace("v1=", "")
  if (!timestamp || !expected) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false
  return constantTimeEqual(await hmacHex(secret, `${timestamp}.${rawBody}`), expected)
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405 })

    const rawBody = await request.text()
    const header = request.headers.get("tickward-signature") ?? ""

    if (!(await verifySignature(header, rawBody, env.TICKWARD_WEBHOOK_SECRET))) {
      return new Response("invalid signature", { status: 401 })
    }

    if (env.FORWARD_URL) {
      const forwarded = await fetch(env.FORWARD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rawBody,
      })
      return new Response(null, { status: forwarded.ok ? 200 : 502 })
    }

    const event = JSON.parse(rawBody) as { id: string; type: string }
    console.log(`[tickward] ${event.type} ${event.id}`)
    // Handle the event here. Keep it idempotent - deliveries can retry.

    return new Response("ok", { status: 200 })
  },
}

export default worker
