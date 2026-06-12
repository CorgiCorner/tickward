"use client"

import { notificationSoundSource, type NotificationSound } from "@/lib/notification-preferences"

let unlockedAudioContext: AudioContext | null = null

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
  return await resumeAudioContext(context)
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
