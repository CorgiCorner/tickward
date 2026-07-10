"use client"

import { toast } from "sonner"

import { useAccountPreferences } from "@/components/account-preferences-provider"
import { TimezoneSelect } from "@/components/timezone-select"
import { Label } from "@/components/ui/label"
import { useBrowserTimeZone } from "@/lib/default-timezone.client"
import { formatMessage } from "@/lib/i18n/messages"

export function DefaultTimezoneSettingsRow() {
  const { loading, preferences, saving, updatePreferences } = useAccountPreferences()
  const browserTimeZone = useBrowserTimeZone()
  const defaultTimeZone = preferences.default_timezone ?? browserTimeZone
  const disabled = loading || saving

  async function saveDefaultTimeZone(timezone: string) {
    try {
      if (timezone === browserTimeZone) {
        await updatePreferences({ default_timezone: null })
        toast.success(formatMessage("settings.defaultTimezoneReset"))
      } else {
        await updatePreferences({ default_timezone: timezone })
        toast.success(formatMessage("settings.defaultTimezoneSaved"))
      }
    } catch {
      toast.error(formatMessage("settings.preferencesUnavailable"))
    }
  }

  return (
    <div id="defaults" className="flex scroll-mt-28 items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <Label className="text-sm font-medium">{formatMessage("settings.defaultTimezone")}</Label>
        <p className="text-xs text-muted-foreground">
          {formatMessage("settings.defaultTimezoneDescription", { timezone: browserTimeZone })}
        </p>
      </div>
      <TimezoneSelect
        aria-label={formatMessage("settings.defaultTimezone")}
        disabled={disabled}
        value={defaultTimeZone}
        localTz={browserTimeZone}
        triggerClassName="h-8 w-44 px-2.5 text-xs"
        onChange={(timezone) => void saveDefaultTimeZone(timezone)}
      />
    </div>
  )
}
