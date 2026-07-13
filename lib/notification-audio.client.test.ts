import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

class MockAudio {
  static sources: string[] = []

  volume = 0

  constructor(readonly src: string) {
    MockAudio.sources.push(src)
  }

  play = vi.fn().mockRejectedValue(new Error("autoplay blocked"))
}

function installAudioContextMock(initialState: AudioContextState = "suspended") {
  const oscillatorStart = vi.fn()
  const oscillatorStop = vi.fn()
  const bufferSourceStart = vi.fn()
  const bufferSourceStop = vi.fn()
  const contexts: Array<{ resume: ReturnType<typeof vi.fn>; state: AudioContextState; currentTime: number }> = []

  class MockAudioContext {
    currentTime = 10
    destination = {}
    state: AudioContextState = initialState

    constructor() {
      contexts.push(this)
    }

    resume = vi.fn(async () => {
      this.state = "running"
    })

    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: oscillatorStart,
        stop: oscillatorStop,
      }
    }

    createGain() {
      return {
        gain: { value: 0 },
        connect: vi.fn(),
      }
    }

    createBufferSource() {
      return {
        buffer: null as AudioBuffer | null,
        loop: false,
        connect: vi.fn(),
        start: bufferSourceStart,
        stop: bufferSourceStop,
        onended: null,
      }
    }

    createBuffer(numChannels: number, length: number, sampleRate: number) {
      return { numChannels, length, sampleRate } as unknown as AudioBuffer
    }

    decodeAudioData(): Promise<AudioBuffer> {
      return Promise.resolve({ duration: 1 } as unknown as AudioBuffer)
    }
  }

  vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext)

  return { contexts, oscillatorStart, oscillatorStop, bufferSourceStart, bufferSourceStop }
}

describe("notification audio", () => {
  beforeEach(() => {
    vi.resetModules()
    MockAudio.sources = []
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio)
    // Stub fetch for buffer loading
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("unlocks a reusable audio context from a user gesture", async () => {
    const { contexts, oscillatorStart } = installAudioContextMock()
    const { unlockNotificationAudio } = await import("@/lib/notification-audio.client")

    await expect(unlockNotificationAudio("glass")).resolves.toBe(true)

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1)
    expect(oscillatorStart).toHaveBeenCalledTimes(1)
  })

  it("primes the audio context from a user gesture without playing a tone", async () => {
    const { contexts, oscillatorStart } = installAudioContextMock()
    const { primeNotificationAudio } = await import("@/lib/notification-audio.client")

    await expect(primeNotificationAudio()).resolves.toBe(true)

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1)
    expect(oscillatorStart).not.toHaveBeenCalled()
  })

  it("falls back to the unlocked audio context when HTML audio is blocked", async () => {
    const { contexts, oscillatorStart } = installAudioContextMock()
    const { playNotificationSound, unlockNotificationAudio } = await import("@/lib/notification-audio.client")

    await unlockNotificationAudio("polite")
    await expect(playNotificationSound("polite")).resolves.toBe(true)

    expect(contexts).toHaveLength(1)
    expect(MockAudio.sources).toEqual(["/sounds/notifications/polite.mp3"])
    expect(oscillatorStart).toHaveBeenCalledTimes(2)
  })

  describe("scheduleNotificationSound", () => {
    it.each([
      {
        reason: "the context is not running",
        state: "suspended" as const,
        sound: "polite" as const,
        targetOffsetMs: 5000,
        prepare: false,
      },
      {
        reason: "sound is 'none'",
        state: "running" as const,
        sound: "none" as const,
        targetOffsetMs: 5000,
        prepare: false,
      },
      {
        reason: "the target is in the past",
        state: "running" as const,
        sound: "polite" as const,
        targetOffsetMs: -1000,
        prepare: true,
      },
    ])("returns null when $reason", async ({ state, sound, targetOffsetMs, prepare }) => {
      installAudioContextMock(state)
      const { prepareNotificationSound, scheduleNotificationSound } = await import("@/lib/notification-audio.client")
      if (prepare) await prepareNotificationSound(sound)

      const result = scheduleNotificationSound(sound, Date.now() + targetOffsetMs)
      expect(result).toBeNull()
    })

    it("returns null when buffer is not yet decoded", async () => {
      installAudioContextMock("running")
      const { scheduleNotificationSound } = await import("@/lib/notification-audio.client")
      // No prepareNotificationSound call — buffer not in cache

      const result = scheduleNotificationSound("polite", Date.now() + 5000)
      expect(result).toBeNull()
    })

    it("schedules a BufferSource at ctx.currentTime + secondsUntil and returns cancel", async () => {
      const { bufferSourceStart, bufferSourceStop, contexts } = installAudioContextMock("running")
      const { prepareNotificationSound, scheduleNotificationSound } = await import("@/lib/notification-audio.client")

      await prepareNotificationSound("polite")
      const targetEpochMs = Date.now() + 10_000

      const handle = scheduleNotificationSound("polite", targetEpochMs)
      expect(handle).not.toBeNull()

      // start() should have been called with ctx.currentTime + secondsUntil
      const ctx = contexts[0]!
      const secondsUntil = (targetEpochMs - Date.now()) / 1000
      expect(bufferSourceStart).toHaveBeenCalledWith(expect.closeTo(ctx.currentTime + secondsUntil, 0 /* within 1s */))

      // cancel() calls stop()
      handle!.cancel()
      expect(bufferSourceStop).toHaveBeenCalledTimes(1)
    })

    it("cancel() is idempotent and does not throw", async () => {
      installAudioContextMock("running")
      const { prepareNotificationSound, scheduleNotificationSound } = await import("@/lib/notification-audio.client")

      await prepareNotificationSound("polite")
      const handle = scheduleNotificationSound("polite", Date.now() + 5000)
      expect(handle).not.toBeNull()

      expect(() => {
        handle!.cancel()
        handle!.cancel()
      }).not.toThrow()
    })
  })
})
