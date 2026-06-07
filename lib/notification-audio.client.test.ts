import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

class MockAudio {
  static sources: string[] = []

  volume = 0

  constructor(readonly src: string) {
    MockAudio.sources.push(src)
  }

  play = vi.fn().mockRejectedValue(new Error("autoplay blocked"))
}

function installAudioContextMock() {
  const oscillatorStart = vi.fn()
  const oscillatorStop = vi.fn()
  const contexts: Array<{ resume: ReturnType<typeof vi.fn>; state: AudioContextState }> = []

  class MockAudioContext {
    currentTime = 10
    destination = {}
    state: AudioContextState = "suspended"

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
  }

  vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext)

  return { contexts, oscillatorStart, oscillatorStop }
}

describe("notification audio", () => {
  beforeEach(() => {
    vi.resetModules()
    MockAudio.sources = []
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio)
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

  it("falls back to the unlocked audio context when HTML audio is blocked", async () => {
    const { contexts, oscillatorStart } = installAudioContextMock()
    const { playNotificationSound, unlockNotificationAudio } = await import("@/lib/notification-audio.client")

    await unlockNotificationAudio("polite")
    await expect(playNotificationSound("polite")).resolves.toBe(true)

    expect(contexts).toHaveLength(1)
    expect(MockAudio.sources).toEqual(["/sounds/notifications/polite.mp3"])
    expect(oscillatorStart).toHaveBeenCalledTimes(2)
  })
})
