// tickward scheduler / Cloudflare Workers Cron Trigger.
//
// Secrets/vars:
//   TICKWARD_BASE_URL          - public base URL of your tickward deployment
//   TICKWARD_SCHEDULER_SECRET  - same secret as the tickward app environment
//   STATUS_HEARTBEAT_URL       - optional; status-page heartbeat pinged after a
//                                successful tick. Missed ping => status page
//                                flags the scheduler as down.

type Env = {
  TICKWARD_BASE_URL: string
  TICKWARD_SCHEDULER_SECRET: string
  STATUS_HEARTBEAT_URL?: string
}

type ScheduledController = {
  cron: string
  scheduledTime: number
}

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
}

function schedulerUrl(baseUrl: string) {
  return new URL("/api/internal/scheduler/tick", baseUrl).toString()
}

async function runSchedulerTick(env: Env) {
  const response = await fetch(schedulerUrl(env.TICKWARD_BASE_URL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TICKWARD_SCHEDULER_SECRET}`,
    },
  })

  if (!response.ok) {
    throw new Error(`tickward scheduler failed with ${response.status}`)
  }
}

// Fire-and-forget heartbeat. Only called once a tick has succeeded, so a missing
// heartbeat means either the worker stopped firing or the tick itself failed.
async function pingHeartbeat(env: Env) {
  if (!env.STATUS_HEARTBEAT_URL) return
  try {
    await fetch(env.STATUS_HEARTBEAT_URL, { method: "GET" })
  } catch {
    // Never let heartbeat delivery failures affect the scheduler outcome.
  }
}

const worker = {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await runSchedulerTick(env)
    ctx.waitUntil(pingHeartbeat(env))
  },
}

export default worker
