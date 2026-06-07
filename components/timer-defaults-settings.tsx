"use client"

import { Globe2Icon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { useAccountPreferences } from "@/components/account-preferences-provider"
import { TimezoneSelect } from "@/components/timezone-select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useBrowserTimeZone } from "@/lib/default-timezone.client"
import { formatMessage } from "@/lib/i18n/messages"

export function TimerDefaultsSettingsPanel() {
  const { loading, preferences, saving, updatePreferences } = useAccountPreferences()
  const browserTimeZone = useBrowserTimeZone()
  const defaultTimeZone = preferences.default_timezone ?? browserTimeZone
  const usingBrowserTimeZone = defaultTimeZone === browserTimeZone
  const disabled = loading || saving

  async function saveDefaultTimeZone(timezone: string) {
    try {
      await updatePreferences({ default_timezone: timezone })
      toast.success(formatMessage("settings.defaultTimezoneSaved"))
    } catch {
      toast.error(formatMessage("settings.preferencesUnavailable"))
    }
  }

  async function resetDefaultTimeZone() {
    try {
      await updatePreferences({ default_timezone: null })
      toast.success(formatMessage("settings.defaultTimezoneReset"))
    } catch {
      toast.error(formatMessage("settings.preferencesUnavailable"))
    }
  }

  return (
    <section id="defaults" className="grid scroll-mt-6 gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{formatMessage("settings.timerDefaults")}</h2>
        <p className="text-sm text-muted-foreground">{formatMessage("settings.timerDefaultsDescription")}</p>
      </div>
      <div className="rounded-lg bg-muted/30 p-3">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground">
            <Globe2Icon className="size-4" />
          </div>
          <div className="grid min-w-0 flex-1 gap-3">
            <div className="grid gap-1">
              <Label>{formatMessage("settings.defaultTimezone")}</Label>
              <p className="text-xs text-muted-foreground">
                {formatMessage("settings.defaultTimezoneDescription", { timezone: browserTimeZone })}
              </p>
            </div>
            <TimezoneSelect
              disabled={disabled}
              value={defaultTimeZone}
              localTz={browserTimeZone}
              onChange={(timezone) => void saveDefaultTimeZone(timezone)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-[190px]"
              disabled={disabled || usingBrowserTimeZone}
              onClick={() => void resetDefaultTimeZone()}
            >
              <RotateCcwIcon className="size-4" />
              {formatMessage("settings.useBrowserTimezone")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
