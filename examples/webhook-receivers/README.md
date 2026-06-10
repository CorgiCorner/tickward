# tickward webhook receivers

Copy-paste receivers that verify the `tickward-signature` header before
trusting a delivery. Each example:

1. reads the **raw** request body (no re-parsing before hashing),
2. computes HMAC SHA-256 over `<timestamp>.<raw body>` with the endpoint
   signing secret,
3. compares it with the `v1` value in constant time,
4. rejects timestamps older than 5 minutes.

Set the signing secret (shown once when the endpoint is created) as the
`TICKWARD_WEBHOOK_SECRET` environment variable.

| Example | Runtime | Notes |
| - | - |
| `node/server.mjs` | Node.js 18+ | zero dependencies, `node server.mjs` |
| `cloudflare-worker/worker.ts` | Cloudflare Workers | optional verifying relay (e.g. in front of a Zapier hook URL) |
| `python/receiver.py` | Python 3.10+ | zero dependencies, `python receiver.py` |

The signature header has the shape:

```txt
tickward-signature: t=1780000000,v1=<hmac_sha256_hex>
```

See the webhook guide (`/docs/guides/webhooks`) for the event envelope and
retry behavior. Keep handlers idempotent - deliveries can retry.
