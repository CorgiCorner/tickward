// tickward scheduler / Cloudflare Workers Cron Trigger.
//
// Secrets/vars:
//   TICKWARD_BASE_URL          - public base URL of your tickward deployment
//   TICKWARD_SCHEDULER_SECRET  - same secret as the tickward app environment

type Env = {
  TICKWARD_BASE_URL: string
  TICKWARD_SCHEDULER_SECRET: string
}

type ScheduledController = {
  cron: string
  scheduledTime: number
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

const worker = {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runSchedulerTick(env)
  },
}

export default worker
