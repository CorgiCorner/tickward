"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import {
  accountPreferencesRecordSchema,
  DEFAULT_ACCOUNT_PREFERENCES,
  type AccountPreferencesPatch,
  type AccountPreferencesRecord,
} from "@/lib/account-preferences"
import { resetDefaultTimeZonePreference, setDefaultTimeZonePreference } from "@/lib/default-timezone.client"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { setLocalFullPageAlarmEnabled, setLocalNotificationSound } from "@/lib/local-notification-preferences.client"

type AccountPreferencesContextValue = {
  error: string | null
  loading: boolean
  preferences: AccountPreferencesRecord
  refreshPreferences: () => Promise<AccountPreferencesRecord | null>
  saving: boolean
  updatePreferences: (patch: AccountPreferencesPatch) => Promise<AccountPreferencesRecord>
}

const AccountPreferencesContext = createContext<AccountPreferencesContextValue | null>(null)

export function applyAccountPreferencesToDevice(preferences: AccountPreferencesRecord) {
  if (preferences.default_timezone) {
    setDefaultTimeZonePreference(preferences.default_timezone)
  } else {
    resetDefaultTimeZonePreference()
  }

  setLocalFullPageAlarmEnabled(preferences.full_page_alarm)
  setLocalNotificationSound(preferences.notification_sound)
}

async function readAccountPreferencesResponse(
  res: Response,
  fallbackMessageKey: MessageKey,
): Promise<AccountPreferencesRecord> {
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(formatMessage(fallbackMessageKey))

  const parsed = accountPreferencesRecordSchema.safeParse(data)
  if (!parsed.success) throw new Error(formatMessage(fallbackMessageKey))
  return parsed.data
}

async function fetchAccountPreferences() {
  const res = await fetch("/api/account/preferences", { cache: "no-store" })
  return readAccountPreferencesResponse(res, "settings.preferencesLoadFailed")
}

async function patchAccountPreferences(patch: AccountPreferencesPatch) {
  const res = await fetch("/api/account/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })
  return readAccountPreferencesResponse(res, "settings.preferencesUnavailable")
}

export function AccountPreferencesProvider(
  props: Readonly<{
    children: ReactNode
    initialError?: string | null
    initialPreferences?: AccountPreferencesRecord
  }>,
) {
  const hasInitialPreferences = props.initialPreferences !== undefined
  const [preferences, setPreferences] = useState<AccountPreferencesRecord>(
    () => props.initialPreferences ?? DEFAULT_ACCOUNT_PREFERENCES,
  )
  const [loading, setLoading] = useState(() => !hasInitialPreferences)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(() => props.initialError ?? null)

  const refreshPreferences = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextPreferences = await fetchAccountPreferences()
      setPreferences(nextPreferences)
      applyAccountPreferencesToDevice(nextPreferences)
      return nextPreferences
    } catch {
      setError(formatMessage("settings.preferencesLoadFailed"))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const updatePreferences = useCallback(async (patch: AccountPreferencesPatch) => {
    setSaving(true)
    setError(null)
    try {
      const nextPreferences = await patchAccountPreferences(patch)
      setPreferences(nextPreferences)
      setError(null)
      applyAccountPreferencesToDevice(nextPreferences)
      return nextPreferences
    } catch {
      throw new Error(formatMessage("settings.preferencesUnavailable"))
    } finally {
      setSaving(false)
    }
  }, [])

  useEffect(() => {
    if (hasInitialPreferences) applyAccountPreferencesToDevice(preferences)
  }, [hasInitialPreferences, preferences])

  useEffect(() => {
    if (hasInitialPreferences) return
    void refreshPreferences()
  }, [hasInitialPreferences, refreshPreferences])

  const value = useMemo(
    () => ({ error, loading, preferences, refreshPreferences, saving, updatePreferences }),
    [error, loading, preferences, refreshPreferences, saving, updatePreferences],
  )

  return <AccountPreferencesContext.Provider value={value}>{props.children}</AccountPreferencesContext.Provider>
}

export function useAccountPreferences() {
  const value = useContext(AccountPreferencesContext)
  if (!value) throw new Error("useAccountPreferences must be used within AccountPreferencesProvider")
  return value
}
