"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useAccountPreferences } from "@/components/account-preferences-provider"
import { trackCountUpAnalyticsEvent } from "@/components/plausible-analytics"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { authClient } from "@/lib/auth/auth-client"
import {
  COUNT_UP_POLICY_MAX_MINUTES,
  COUNT_UP_POLICY_MIN_MINUTES,
  countUpPolicySchema,
  type CountUpPolicy,
  type CountUpPolicyMode,
} from "@/lib/count-up-policy"
import { formatMessage } from "@/lib/i18n/messages"
import { setLocalCountUpPolicy, useLocalCountUpPolicy } from "@/lib/local-count-up-policy.client"
import { useTimerStore } from "@/lib/store"

export const COUNT_UP_SETTINGS_SECTION_ID = "count-up-policy-settings"
const POLICY_OPTIONS: Array<{ mode: CountUpPolicyMode; label: Parameters<typeof formatMessage>[0] }> = [
  { mode: "move-directly-to-past", label: "settings.countUp.moveDirectly" },
  { mode: "until-i-move-it", label: "settings.countUp.untilMoved" },
  { mode: "after-seen-5m", label: "settings.countUp.afterSeen5m" },
  { mode: "after-seen-15m", label: "settings.countUp.afterSeen15m" },
  { mode: "after-seen-1h", label: "settings.countUp.afterSeen1h" },
  { mode: "after-seen-1d", label: "settings.countUp.afterSeen1d" },
  { mode: "custom", label: "settings.countUp.custom" },
]

function policyForMode(mode: CountUpPolicyMode, customMinutes: string): CountUpPolicy | null {
  const minutes = mode === "custom" ? Number(customMinutes) : null
  const result = countUpPolicySchema.safeParse({ mode, minutes })
  return result.success ? result.data : null
}

function durationLabel(policy: CountUpPolicy) {
  if (policy.mode === "after-seen-5m") return formatMessage("settings.countUp.duration5m")
  if (policy.mode === "after-seen-15m") return formatMessage("settings.countUp.duration15m")
  if (policy.mode === "after-seen-1h") return formatMessage("settings.countUp.duration1h")
  if (policy.mode === "after-seen-1d") return formatMessage("settings.countUp.duration1d")
  if (policy.mode === "custom" && policy.minutes !== null) {
    return formatMessage(
      policy.minutes === 1 ? "settings.countUp.durationCustomOne" : "settings.countUp.durationCustomMany",
      { minutes: policy.minutes },
    )
  }
  return ""
}

function policyHelper(policy: CountUpPolicy) {
  if (policy.mode === "until-i-move-it") return formatMessage("settings.countUp.helperUntilAcknowledged")
  if (policy.mode === "move-directly-to-past") return formatMessage("settings.countUp.helperSkip")
  const singular =
    policy.mode === "after-seen-1h" ||
    policy.mode === "after-seen-1d" ||
    (policy.mode === "custom" && policy.minutes === 1)
  return formatMessage(singular ? "settings.countUp.helperTimedSingular" : "settings.countUp.helperTimed", {
    duration: durationLabel(policy),
  })
}

function CountUpPolicyFields(
  props: Readonly<{
    disabled: boolean
    policy: CountUpPolicy
    onSave: (policy: CountUpPolicy) => Promise<void> | void
  }>,
) {
  const [customMinutes, setCustomMinutes] = useState(() => String(props.policy.minutes ?? 30))
  const [validationError, setValidationError] = useState(false)

  function saveMode(mode: CountUpPolicyMode) {
    const next = policyForMode(mode, customMinutes)
    if (!next) {
      setValidationError(true)
      return
    }
    setValidationError(false)
    if (next.mode === props.policy.mode && next.minutes === props.policy.minutes) return
    void props.onSave(next)
  }

  return (
    <div
      id={COUNT_UP_SETTINGS_SECTION_ID}
      data-settings-section="count-up-policy"
      className="grid scroll-mt-3 gap-3 rounded-lg border p-4"
    >
      <div className="grid gap-1">
        <div className="text-sm font-medium">{formatMessage("settings.countUp.title")}</div>
        <div className="text-xs text-muted-foreground">{policyHelper(props.policy)}</div>
        <div className="text-xs text-muted-foreground">{formatMessage("settings.countUp.scope")}</div>
      </div>

      <Label htmlFor="count-up-policy" className="sr-only">
        {formatMessage("settings.countUp.title")}
      </Label>
      <Select
        value={props.policy.mode}
        disabled={props.disabled}
        onValueChange={(value) => saveMode(value as CountUpPolicyMode)}
      >
        <SelectTrigger id="count-up-policy" aria-label={formatMessage("settings.countUp.title")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {POLICY_OPTIONS.map((option) => (
            <SelectItem key={option.mode} value={option.mode}>
              {formatMessage(option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {props.policy.mode === "custom" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="count-up-custom-minutes">{formatMessage("settings.countUp.customMinutes")}</Label>
          <Input
            id="count-up-custom-minutes"
            type="number"
            min={COUNT_UP_POLICY_MIN_MINUTES}
            max={COUNT_UP_POLICY_MAX_MINUTES}
            step={1}
            value={customMinutes}
            disabled={props.disabled}
            aria-invalid={validationError}
            onChange={(event) => setCustomMinutes(event.target.value)}
            onBlur={() => saveMode("custom")}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
          {validationError ? (
            <p className="text-xs text-destructive" role="alert">
              {formatMessage("validation.afterZeroMinutes")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function useCountUpSectionSize() {
  const events = useTimerStore((state) => state.countUpOccurrences) ?? []
  const timers = useTimerStore((state) => state.timers) ?? []
  const timersById = new Map(timers.map((timer) => [timer.id, timer]))
  return new Set(
    events
      .filter((event) => {
        const timer = timersById.get(event.timerId)
        return event.acknowledgedAt === null && timer !== undefined && !timer.archivedAt && timer.pinned !== true
      })
      .map((event) => event.timerId),
  ).size
}

function AnonymousCountUpPolicySettings() {
  const policy = useLocalCountUpPolicy()
  const setCountUpPolicy = useTimerStore((state) => state.setCountUpPolicy)
  const sectionSize = useCountUpSectionSize()

  function save(next: CountUpPolicy) {
    setLocalCountUpPolicy(next)
    setCountUpPolicy(next)
    trackCountUpAnalyticsEvent("transition_policy_changed", { policy: next.mode, sectionSize })
  }

  return (
    <CountUpPolicyFields
      key={`${policy.mode}:${policy.minutes ?? "none"}`}
      disabled={false}
      policy={policy}
      onSave={save}
    />
  )
}

function SignedInCountUpPolicySettings() {
  const { loading, preferences, saving, updatePreferences } = useAccountPreferences()
  const setCountUpPolicy = useTimerStore((state) => state.setCountUpPolicy)
  const syncCountUpOccurrences = useTimerStore((state) => state.syncCountUpOccurrences)
  const sectionSize = useCountUpSectionSize()

  async function save(next: CountUpPolicy) {
    try {
      await updatePreferences({ count_up_policy: next })
      setCountUpPolicy(next)
      await syncCountUpOccurrences()
      trackCountUpAnalyticsEvent("transition_policy_changed", { policy: next.mode, sectionSize })
    } catch {
      toast.error(formatMessage("settings.preferencesUnavailable"))
    }
  }

  const policy = preferences.count_up_policy
  return (
    <CountUpPolicyFields
      key={`${policy.mode}:${policy.minutes ?? "none"}`}
      disabled={loading || saving}
      policy={policy}
      onSave={save}
    />
  )
}

export function CountUpPolicySettings() {
  const session = authClient.useSession()
  if (session.data?.user) return <SignedInCountUpPolicySettings />
  return <AnonymousCountUpPolicySettings />
}
