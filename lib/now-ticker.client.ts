"use client"

type TickListener = () => void

const TICK_INTERVAL_MS = 1000

let nowMs = Date.now()
const listeners = new Set<TickListener>()
let worker: Worker | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

// Background tabs throttle main-thread timers heavily; dedicated worker timers keep firing.
function createTickWorker() {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return null

  try {
    const source = `setInterval(() => postMessage(0), ${TICK_INTERVAL_MS});`
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
    try {
      return new Worker(url)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

function tick() {
  nowMs = Date.now()
  for (const listener of listeners) listener()
}

function handleVisibilityChange() {
  if (!document.hidden) tick()
}

function startTicker() {
  nowMs = Date.now()
  worker = createTickWorker()
  if (worker) worker.onmessage = tick
  else intervalId = globalThis.setInterval(tick, TICK_INTERVAL_MS)
  document.addEventListener("visibilitychange", handleVisibilityChange)
}

function stopTicker() {
  worker?.terminate()
  worker = null
  if (intervalId !== null) {
    globalThis.clearInterval(intervalId)
    intervalId = null
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange)
}

export function subscribeToNow(listener: TickListener) {
  if (listeners.size === 0) startTicker()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopTicker()
  }
}

export function nowSnapshot() {
  return nowMs
}
