"use client"

import { runInBackground } from "@/lib/background-task"
import { notificationSoundSource, type NotificationSound } from "@/lib/notification-preferences"

let unlockedAudioContext: AudioContext | null = null

// Keep-alive node to prevent the AudioContext from being suspended while the
// tab is hidden. A near-silent continuous source keeps the context "active"
// so scheduled BufferSources play at the correct hardware-clock time even when
// the tab is backgrounded.
let keepAliveSource: AudioBufferSourceNode | null = null

// Decoded AudioBuffer cache. null = decode failed; undefined = not yet attempted.
const decodedBuffers = new Map<NotificationSound, AudioBuffer | null>()
// In-flight dedupe: avoid issuing two concurrent decode requests for the same sound.
const inflightDecodes = new Map<NotificationSound, Promise<AudioBuffer | null>>()

function audioContextConstructor() {
  return (
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  )
}

function reusableAudioContext() {
  if (globalThis.window === undefined) return null
  if (unlockedAudioContext && unlockedAudioContext.state !== "closed") return unlockedAudioContext

  const AudioContextCtor = audioContextConstructor()
  if (!AudioContextCtor) return null

  unlockedAudioContext = new AudioContextCtor()
  // Clear buffer cache when we create a new context (old buffers belong to old ctx).
  decodedBuffers.clear()
  inflightDecodes.clear()
  return unlockedAudioContext
}

async function resumeAudioContext(context: AudioContext) {
  if (context.state !== "suspended") return true
  try {
    await context.resume()
  } catch {
    return false
  }
  return context.state !== "suspended"
}

// Start a near-silent looping keep-alive buffer so the context stays active
// while the tab is hidden. Safe to call multiple times — bails out if already running.
function startKeepAlive(ctx: AudioContext) {
  if (keepAliveSource) return
  try {
    // 1-frame silent buffer played in a loop keeps the context "active"
    const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    keepAliveSource = ctx.createBufferSource()
    keepAliveSource.buffer = silentBuffer
    keepAliveSource.loop = true
    // Nearly-silent gain so it is imperceptible.
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    keepAliveSource.connect(gain)
    gain.connect(ctx.destination)
    keepAliveSource.start()
    keepAliveSource.onended = () => {
      keepAliveSource = null
    }
  } catch {
    keepAliveSource = null
  }
}

// Attempt to decode `sound` from its mp3 source (with .ogg fallback).
// Result is cached; concurrent calls for the same sound share one Promise.
async function loadBuffer(sound: NotificationSound): Promise<AudioBuffer | null> {
  if (globalThis.window === undefined) return null

  const cached = decodedBuffers.get(sound)
  if (cached !== undefined) return cached

  const inflight = inflightDecodes.get(sound)
  if (inflight) return inflight

  const src = notificationSoundSource(sound)
  if (!src) {
    decodedBuffers.set(sound, null)
    return null
  }

  const ctx = reusableAudioContext()
  if (!ctx) {
    decodedBuffers.set(sound, null)
    return null
  }

  const attempt = async (url: string): Promise<AudioBuffer | null> => {
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`fetch ${url} ${resp.status}`)
      const arrayBuf = await resp.arrayBuffer()
      return await ctx.decodeAudioData(arrayBuf)
    } catch {
      return null
    }
  }

  const promise = (async () => {
    let buf = await attempt(src)
    // .ogg fallback
    buf ??= await attempt(src.replace(/\.mp3$/, ".ogg"))
    decodedBuffers.set(sound, buf)
    inflightDecodes.delete(sound)
    return buf
  })()

  inflightDecodes.set(sound, promise)
  return promise
}

/**
 * Decode and cache the AudioBuffer for `sound`. Call this on the gesture-prime
 * path so the buffer is ready before arm time. Also ensures the context is resumed
 * and the keep-alive is running.
 */
export async function prepareNotificationSound(sound: NotificationSound): Promise<void> {
  if (sound === "none" || globalThis.window === undefined) return
  const ctx = reusableAudioContext()
  if (!ctx) return
  if (!(await resumeAudioContext(ctx))) return
  startKeepAlive(ctx)
  await loadBuffer(sound)
}

/**
 * Schedule `sound` to play at exactly `targetEpochMs` using the Web Audio
 * hardware clock. The scheduled source plays even if the tab is hidden,
 * provided the AudioContext is running and a keep-alive is active.
 *
 * Returns a { cancel } handle, or null if scheduling was not possible
 * (context not running, sound === 'none', buffer not decoded, target in the past).
 *
 * IMPORTANT: callers must check the return value and store the cancel handle
 * so it can be invoked if the timer is disarmed before firing.
 */
export function scheduleNotificationSound(sound: NotificationSound, targetEpochMs: number): { cancel(): void } | null {
  if (sound === "none" || globalThis.window === undefined) return null

  const ctx = reusableAudioContext()
  if (ctx?.state !== "running") return null

  const buffer = decodedBuffers.get(sound)
  if (!buffer) return null

  const secondsUntil = (targetEpochMs - Date.now()) / 1000
  if (secondsUntil <= 0) return null

  try {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.start(ctx.currentTime + secondsUntil)

    return {
      cancel() {
        try {
          src.stop()
        } catch {
          // already stopped or context closed
        }
      },
    }
  } catch {
    return null
  }
}

function fallbackFrequency(sound: NotificationSound) {
  if (sound === "alarm") return 880
  if (sound === "glass") return 740
  return 660
}

async function playFallbackTone(sound: NotificationSound) {
  try {
    const context = reusableAudioContext()
    if (!context) return false
    if (!(await resumeAudioContext(context))) return false

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = sound === "alarm" ? "square" : "sine"
    oscillator.frequency.value = fallbackFrequency(sound)
    gain.gain.value = sound === "alarm" ? 0.08 : 0.045
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.25)
    return true
  } catch {
    return false
  }
}

export async function unlockNotificationAudio(sound: NotificationSound = "polite") {
  if (sound === "none") return false
  return playFallbackTone(sound)
}

export async function primeNotificationAudio() {
  const context = reusableAudioContext()
  if (!context) return false
  const ok = await resumeAudioContext(context)
  if (ok) startKeepAlive(context)
  return ok
}

export async function playNotificationSound(sound: NotificationSound) {
  if (sound === "none" || globalThis.window === undefined) return false

  const source = notificationSoundSource(sound)
  if (source && "Audio" in globalThis) {
    try {
      const audio = new Audio(source)
      audio.volume = sound === "alarm" ? 0.8 : 0.55
      await audio.play()
      return true
    } catch {
      return await playFallbackTone(sound)
    }
  }

  return await playFallbackTone(sound)
}

// Re-resume the AudioContext and restart the keep-alive if the context was
// suspended due to background tab freezing. Attach this to visibilitychange.
export function resumeAudioContextIfNeeded() {
  if (globalThis.window === undefined) return
  const ctx = unlockedAudioContext
  if (!ctx || ctx.state === "closed") return
  if (ctx.state === "suspended") {
    runInBackground(
      "notificationAudio.resume",
      ctx.resume().then(() => {
        if (ctx.state === "running") startKeepAlive(ctx)
      }),
    )
  } else {
    startKeepAlive(ctx)
  }
}
