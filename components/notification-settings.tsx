"use client"

import { BellIcon, BellOffIcon, MailIcon, Volume2Icon } from "lucide-react"
import { toast } from "sonner"

import { useAccountPreferences } from "@/components/account-preferences-provider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { AccountPreferencesPatch, AccountPreferencesRecord } from "@/lib/account-preferences"
import { formatMessage } from "@/lib/i18n/messages"
import {
  setLocalBrowserNotificationsEnabled,
  useLocalNotificationPreferences,
} from "@/lib/local-notification-preferences.client"
import { playNotificationSound } from "@/lib/notification-audio.client"
import { NOTIFICATION_SOUND_OPTIONS, type NotificationSound } from "@/lib/notification-preferences"

function systemAlertsAllowed(browserNotificationsEnabled: boolean) {
  return (
    browserNotificationsEnabled &&
    globalThis.window !== undefined &&
    "Notification" in globalThis &&
    Notification.permission === "granted"
  )
}

async function toggleSystemAlerts(systemAlertsEnabled: boolean) {
  if (systemAlertsEnabled) {
    setLocalBrowserNotificationsEnabled(false)
    toast.success(formatMessage("notifications.browser.disabled"))
    return
  }

  if (!("Notification" in globalThis)) {
    toast.error(formatMessage("notifications.browserNotSupported"))
    return
  }

  try {
    const permission = await Notification.requestPermission()
    const enabled = permission === "granted"
    setLocalBrowserNotificationsEnabled(enabled)
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

function DeviceNotificationsSection(
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

function EmailRemindersSection(
  props: Readonly<{
    disabled: boolean
    emailReminders: boolean
    onEmailRemindersChange: (enabled: boolean) => void
  }>,
) {
  return (
    <section className="grid gap-3 rounded-lg bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
        <div className="flex min-w-0 gap-3">
          <MailIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="grid gap-1">
            <Label htmlFor="emailReminders">{formatMessage("settings.alerts.emailReminders.title")}</Label>
            <div className="text-xs text-muted-foreground">
              {formatMessage("settings.alerts.emailReminders.description")}
            </div>
          </div>
        </div>
        <Switch
          id="emailReminders"
          aria-label={formatMessage("settings.alerts.emailReminders.title")}
          checked={props.emailReminders}
          disabled={props.disabled}
          onCheckedChange={props.onEmailRemindersChange}
        />
      </div>
    </section>
  )
}

export function NotificationSettingsPanel() {
  const { loading, preferences, saving, updatePreferences } = useAccountPreferences()
  const localPreferences = useLocalNotificationPreferences()
  const accountControlsDisabled = loading || saving
  const deviceControlsDisabled = loading
  const systemAlertsEnabled = systemAlertsAllowed(localPreferences.browserNotificationsEnabled)

  return (
    <section id="alerts" className="grid scroll-mt-6 gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{formatMessage("settings.alerts")}</h2>
        <p className="text-sm text-muted-foreground">{formatMessage("settings.alertsDescription")}</p>
      </div>
      <DeviceNotificationsSection
        disabled={deviceControlsDisabled}
        systemAlertsEnabled={systemAlertsEnabled}
        onToggleNotifications={() => void toggleSystemAlerts(systemAlertsEnabled)}
      />
      <LocalAlarmsSection
        disabled={accountControlsDisabled}
        fullPageAlarm={preferences.full_page_alarm}
        sound={preferences.notification_sound}
        onFullPageAlarmChange={(enabled) =>
          void saveAccountAlertPreferences({ full_page_alarm: enabled }, updatePreferences)
        }
        onPreviewSound={(sound) => void previewNotificationSound(sound)}
        onSoundChange={(sound) => void saveAccountAlertPreferences({ notification_sound: sound }, updatePreferences)}
      />
      <EmailRemindersSection
        disabled={accountControlsDisabled}
        emailReminders={preferences.email_reminders}
        onEmailRemindersChange={(enabled) =>
          void saveAccountAlertPreferences({ email_reminders: enabled }, updatePreferences)
        }
      />
    </section>
  )
}
