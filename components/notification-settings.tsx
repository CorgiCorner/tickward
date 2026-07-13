"use client"

import { BellIcon, BellOffIcon, Volume2Icon } from "lucide-react"
import { toast } from "sonner"

import { useAccountPreferences } from "@/components/account-preferences-provider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { AccountPreferencesPatch, AccountPreferencesRecord } from "@/lib/account-preferences"
import { runInBackground } from "@/lib/background-task"
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
    <div className="flex items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{formatMessage("settings.systemAlerts")}</h3>
        <p className="text-xs text-muted-foreground">{formatMessage("notifications.browser.description")}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 text-xs text-muted-foreground"
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
    </div>
  )
}

function FullPageAlarmRow(
  props: Readonly<{
    disabled: boolean
    fullPageAlarm: boolean
    onFullPageAlarmChange: (enabled: boolean) => void
  }>,
) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor="fullPageAlarm" className="text-sm font-medium">
          {formatMessage("notifications.local.fullPageAlarm")}
        </Label>
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
  )
}

function SoundRow(
  props: Readonly<{
    disabled: boolean
    onPreviewSound: (sound: NotificationSound) => void
    onSoundChange: (sound: NotificationSound) => void
    sound: NotificationSound
  }>,
) {
  return (
    <div className="py-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
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
      <div className="mt-3 flex flex-wrap gap-1.5">
        {NOTIFICATION_SOUND_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={props.sound === option.value}
            disabled={props.disabled}
            className={[
              "rounded-full border px-3 py-1 text-xs transition-colors",
              props.sound === option.value
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
            onClick={() => props.onSoundChange(option.value)}
          >
            {formatMessage(option.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

function InAppNotificationsSection(
  props: Readonly<{
    disabled: boolean
    inAppNotifications: boolean
    onInAppNotificationsChange: (enabled: boolean) => void
  }>,
) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor="inAppNotifications" className="text-sm font-medium">
          {formatMessage("settings.alerts.inAppNotifications.title")}
        </Label>
        <div className="text-xs text-muted-foreground">
          {formatMessage("settings.alerts.inAppNotifications.description")}
        </div>
      </div>
      <Switch
        id="inAppNotifications"
        aria-label={formatMessage("settings.alerts.inAppNotifications.title")}
        checked={props.inAppNotifications}
        disabled={props.disabled}
        onCheckedChange={props.onInAppNotificationsChange}
      />
    </div>
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
    <div className="flex items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor="emailReminders" className="text-sm font-medium">
          {formatMessage("settings.alerts.emailReminders.title")}
        </Label>
        <div className="text-xs text-muted-foreground">
          {formatMessage("settings.alerts.emailReminders.description")}
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
  )
}

export function NotificationSettingsPanel() {
  const { loading, preferences, saving, updatePreferences } = useAccountPreferences()
  const localPreferences = useLocalNotificationPreferences()
  const accountControlsDisabled = loading || saving
  const deviceControlsDisabled = loading
  const systemAlertsEnabled = systemAlertsAllowed(localPreferences.browserNotificationsEnabled)

  return (
    <section id="notifications" className="scroll-mt-28 pt-0">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {formatMessage("settings.notifications")}
      </h2>
      <div id="alerts" className="mt-2 divide-y divide-border scroll-mt-28">
        <InAppNotificationsSection
          disabled={accountControlsDisabled}
          inAppNotifications={preferences.in_app_notifications}
          onInAppNotificationsChange={(enabled) =>
            runInBackground(
              "settings.saveAlertPreferences",
              saveAccountAlertPreferences({ in_app_notifications: enabled }, updatePreferences),
            )
          }
        />
        <FullPageAlarmRow
          disabled={accountControlsDisabled}
          fullPageAlarm={preferences.full_page_alarm}
          onFullPageAlarmChange={(enabled) =>
            runInBackground(
              "settings.saveAlertPreferences",
              saveAccountAlertPreferences({ full_page_alarm: enabled }, updatePreferences),
            )
          }
        />
        <SoundRow
          disabled={accountControlsDisabled}
          sound={preferences.notification_sound}
          onPreviewSound={(sound) => void previewNotificationSound(sound)}
          onSoundChange={(sound) => void saveAccountAlertPreferences({ notification_sound: sound }, updatePreferences)}
        />
        <DeviceNotificationsSection
          disabled={deviceControlsDisabled}
          systemAlertsEnabled={systemAlertsEnabled}
          onToggleNotifications={() => void toggleSystemAlerts(systemAlertsEnabled)}
        />
        <EmailRemindersSection
          disabled={accountControlsDisabled}
          emailReminders={preferences.email_reminders}
          onEmailRemindersChange={(enabled) =>
            runInBackground(
              "settings.saveAlertPreferences",
              saveAccountAlertPreferences({ email_reminders: enabled }, updatePreferences),
            )
          }
        />
      </div>
    </section>
  )
}
