# tickward scheduler on Cloudflare Workers

Minimal Cron Trigger worker for self-hosted tickward deployments.

The worker calls:

```txt
POST https://yourdomain.com/api/internal/scheduler/tick
```

with:

```txt
Authorization: Bearer $TICKWARD_SCHEDULER_SECRET
```

Use the same secret value in the tickward app and this worker.

## Configure

Set the scheduler secret:

```bash
wrangler secret put TICKWARD_SCHEDULER_SECRET
```

Set `TICKWARD_BASE_URL` in `wrangler.jsonc` to your tickward deployment URL.

Deploy:

```bash
wrangler deploy
```

The example cron runs every minute:

```json
{
  "triggers": {
    "crons": ["* * * * *"]
  }
}
```

Cloudflare cron triggers run in UTC. This example does not need a timezone
because it simply asks tickward to process due webhook deliveries and retries.

## Test locally

Run:

```bash
wrangler dev
```

Then trigger the scheduled handler:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

The worker returns an error if the tickward scheduler endpoint does not return a
2xx response. Keep Worker logs enabled in production so failed ticks are visible.
