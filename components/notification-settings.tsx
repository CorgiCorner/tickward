"use client"

import { BellIcon, BellOffIcon, Volume2Icon } from "lucide-react"
import { toast } from "sonner"

import { useAccountPreferences } from "@/components/account-preferences-provider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { AccountPreferencesPatch, AccountPreferencesRecord } from "@/lib/account-preferences"
import { formatMessage } from "@/lib/i18n/messages"
import { playNotificationSound, unlockNotificationAudio } from "@/lib/notification-audio.client"
import { NOTIFICATION_SOUND_OPTIONS, type NotificationSound } from "@/lib/notification-preferences"

function systemAlertsAllowed(preferences: AccountPreferencesRecord) {
  return (
    preferences.browser_notifications_enabled &&
    globalThis.window !== undefined &&
    "Notification" in globalThis &&
    Notification.permission === "granted"
  )
}

async function toggleSystemAlerts(
  systemAlertsEnabled: boolean,
  updatePreferences: (patch: AccountPreferencesPatch) => Promise<AccountPreferencesRecord>,
) {
  if (systemAlertsEnabled) {
    try {
      await updatePreferences({ browser_notifications_enabled: false })
      toast.success(formatMessage("notifications.browser.disabled"))
    } catch {
      toast.error(formatMessage("settings.preferencesUnavailable"))
    }
    return
  }

  if (!("Notification" in globalThis)) {
    toast.error(formatMessage("notifications.browserNotSupported"))
    return
  }

  try {
    const permission = await Notification.requestPermission()
    const enabled = permission === "granted"
    await updatePreferences({ browser_notifications_enabled: enabled })
    if (enabled) {
      toast.success(formatMessage("notifications.browser.enabled"))
    } else {
      toast.error(formatMessage("notifications.permissionDeniedWithSettings"))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : formatMessage("notifications.permissionRequestFailed"))
  }
}

async function saveAccountAlertPreferences(
  patch: AccountPreferencesPatch,
  updatePreferences: (patch: AccountPreferencesPatch) => Promise<AccountPreferencesRecord>,
) {
  try {
    await updatePreferences(patch)
  } catch {
    toast.error(formatMessage("settings.preferencesUnavailable"))
  }
}

async function previewNotificationSound(sound: NotificationSound) {
  const played = await playNotificationSound(sound)
  if (!played) toast.error(formatMessage("notifications.sound.previewFailed"))
}

function SystemAlertsSection(
  props: Readonly<{
    disabled: boolean
    onToggleNotifications: () => void
    systemAlertsEnabled: boolean
  }>,
) {
  return (
    <section className="grid gap-3 rounded-lg bg-muted/30 p-3">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">{formatMessage("settings.systemAlerts")}</h2>
        <p className="text-xs text-muted-foreground">{formatMessage("notifications.browser.description")}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full sm:w-[190px]"
        disabled={props.disabled}
        onClick={props.onToggleNotifications}
      >
        {props.systemAlertsEnabled ? (
          <>
            <BellOffIcon className="mr-1.5 size-4" />
            {formatMessage("notifications.browser.disable")}
          </>
        ) : (
          <>
            <BellIcon className="mr-1.5 size-4" />
            {formatMessage("notifications.browser.enable")}
          </>
        )}
      </Button>
    </section>
  )
}

function LocalAlarmsSection(
  props: Readonly<{
    disabled: boolean
    fullPageAlarm: boolean
    onFullPageAlarmChange: (enabled: boolean) => void
    onPreviewSound: (sound: NotificationSound) => void
    onSoundChange: (sound: NotificationSound) => void
    sound: NotificationSound
  }>,
) {
  return (
    <section className="grid gap-3 rounded-lg bg-muted/30 p-3">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">{formatMessage("notifications.local.title")}</h2>
        <p className="text-xs text-muted-foreground">{formatMessage("notifications.local.description")}</p>
      </div>
      <div className="text-xs text-muted-foreground">{formatMessage("notifications.local.privacyNote")}</div>

      <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <div className="grid gap-1">
          <Label htmlFor="fullPageAlarm">{formatMessage("notifications.local.fullPageAlarm")}</Label>
          <div className="text-xs text-muted-foreground">
            {formatMessage("notifications.local.fullPageAlarmDescription")}
          </div>
        </div>
        <Switch
          id="fullPageAlarm"
          aria-label={formatMessage("notifications.local.fullPageAlarm")}
          checked={props.fullPageAlarm}
          disabled={props.disabled}
          onCheckedChange={props.onFullPageAlarmChange}
        />
      </div>

      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="text-sm font-medium">{formatMessage("notifications.sound")}</div>
            <div className="text-xs text-muted-foreground">{formatMessage("notifications.sound.description")}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={formatMessage("notifications.sound.preview")}
            disabled={props.disabled || props.sound === "none"}
            onClick={() => props.onPreviewSound(props.sound)}
          >
            <Volume2Icon className="size-4" />
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {NOTIFICATION_SOUND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={props.sound === option.value}
              disabled={props.disabled}
              className={[
                "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                props.sound === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => props.onSoundChange(option.value)}
            >
              {formatMessage(option.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

export function NotificationSettingsPanel() {
  const { loading, preferences, saving, updatePreferences } = useAccountPreferences()
  const disabled = loading || saving
  const systemAlertsEnabled = systemAlertsAllowed(preferences)

  return (
    <section id="alerts" className="grid scroll-mt-6 gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{formatMessage("settings.alerts")}</h2>
        <p className="text-sm text-muted-foreground">{formatMessage("settings.alertsDescription")}</p>
      </div>
      <SystemAlertsSection
        disabled={disabled}
        systemAlertsEnabled={systemAlertsEnabled}
        onToggleNotifications={() => void toggleSystemAlerts(systemAlertsEnabled, updatePreferences)}
      />
      <LocalAlarmsSection
        disabled={disabled}
        fullPageAlarm={preferences.full_page_alarm}
        sound={preferences.notification_sound}
        onFullPageAlarmChange={(enabled) =>
          void saveAccountAlertPreferences({ full_page_alarm: enabled }, updatePreferences)
        }
        onPreviewSound={(sound) => void previewNotificationSound(sound)}
        onSoundChange={(sound) => {
          void unlockNotificationAudio(sound)
          void saveAccountAlertPreferences({ notification_sound: sound }, updatePreferences)
        }}
      />
    </section>
  )
}
