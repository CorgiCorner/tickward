import type { MessageKey } from "@/lib/i18n/messages"

export const NOTIFICATION_CHANNELS = ["in_app", "push", "email", "sms", "chat"] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const NOTIFICATION_SOUNDS = ["none", "polite", "glass", "chord", "alarm"] as const

export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number]

export const NOTIFICATION_SOUND_OPTIONS: ReadonlyArray<{
  value: NotificationSound
  labelKey: MessageKey
}> = [
  { value: "none", labelKey: "notifications.sound.none" },
  { value: "polite", labelKey: "notifications.sound.polite" },
  { value: "glass", labelKey: "notifications.sound.glass" },
  { value: "chord", labelKey: "notifications.sound.chord" },
  { value: "alarm", labelKey: "notifications.sound.alarm" },
]

const NOTIFICATION_SOUND_SOURCES: Partial<Record<NotificationSound, string>> = {
  polite: "/sounds/notifications/polite.mp3",
  glass: "/sounds/notifications/glass.mp3",
  chord: "/sounds/notifications/chord.mp3",
  alarm: "/sounds/notifications/alarmed.mp3",
}

export type NotificationPresentation = {
  fullPageAlarm: boolean
  sound: NotificationSound
  requireInteraction: boolean
}

export type TimerNotificationSettings = {
  enabled: boolean
}

export type ResolvedTimerNotificationSettings = TimerNotificationSettings & {
  channels: Partial<Record<NotificationChannel, boolean>>
  presentation: NotificationPresentation
}

export const DEFAULT_NOTIFICATION_PRESENTATION: NotificationPresentation = {
  fullPageAlarm: false,
  sound: "none",
  requireInteraction: false,
}

export const DEFAULT_TIMER_NOTIFICATION_SETTINGS: TimerNotificationSettings = {
  enabled: false,
}

export const DEFAULT_RESOLVED_TIMER_NOTIFICATION_SETTINGS: ResolvedTimerNotificationSettings = {
  enabled: false,
  channels: {
    in_app: true,
    push: false,
    email: false,
    sms: false,
    chat: false,
  },
  presentation: DEFAULT_NOTIFICATION_PRESENTATION,
}

function normalizeNotificationChannels(
  channels: Partial<Record<NotificationChannel, boolean>> | undefined,
): Partial<Record<NotificationChannel, boolean>> {
  return {
    ...DEFAULT_RESOLVED_TIMER_NOTIFICATION_SETTINGS.channels,
    ...channels,
  }
}

export function normalizeTimerNotificationSettings(
  value: Partial<TimerNotificationSettings> | undefined,
  legacyNotify: boolean | undefined,
): ResolvedTimerNotificationSettings {
  return {
    enabled: value?.enabled ?? legacyNotify === true,
    channels: normalizeNotificationChannels(undefined),
    presentation: DEFAULT_NOTIFICATION_PRESENTATION,
  }
}

export const LOCAL_NOTIFICATION_STORAGE_KEYS = {
  enabled: "notificationsEnabled",
  fullPageAlarm: "timerAlarmFullPage",
  sound: "timerAlarmSound",
} as const

export function normalizeNotificationSound(value: unknown): NotificationSound {
  return NOTIFICATION_SOUNDS.includes(value as NotificationSound) ? (value as NotificationSound) : "none"
}

export function notificationSoundSource(sound: NotificationSound) {
  return NOTIFICATION_SOUND_SOURCES[sound] ?? null
}
