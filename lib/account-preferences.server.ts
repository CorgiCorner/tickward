import "server-only"

import {
  DEFAULT_ACCOUNT_PREFERENCES,
  type AccountPreferencesPatch,
  type AccountPreferencesRecord,
} from "@/lib/account-preferences"
import { countUpPolicyDurationMs, normalizeCountUpPolicy } from "@/lib/count-up-policy"
import type { UserRef } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import { notificationSoundSchema } from "@/lib/schemas/timer"

type UserPreferenceRow = {
  defaultTimezone: string | null
  emailReminders: boolean
  fullPageAlarm: boolean
  inAppNotifications?: boolean | null
  notificationSound: string
  countUpPolicy?: string | null
  countUpPolicyMinutes?: number | null
  countUpIntroDismissed?: boolean | null
}

type UserPreferenceDelegate = {
  findUnique(args: { where: { userId: string } }): Promise<UserPreferenceRow | null>
  upsert(args: {
    where: { userId: string }
    create: Record<string, unknown>
    update: Record<string, unknown>
  }): Promise<UserPreferenceRow>
}

export class AccountPreferencesStorageUnavailableError extends Error {
  constructor(message = "Account preferences storage is unavailable.") {
    super(message)
    this.name = "AccountPreferencesStorageUnavailableError"
  }
}

function userPreferenceDelegate(prisma: unknown): UserPreferenceDelegate {
  const delegate = (prisma as { userPreference?: UserPreferenceDelegate }).userPreference
  if (!delegate) {
    throw new AccountPreferencesStorageUnavailableError(
      "Prisma Client is missing the userPreference delegate. Run prisma generate and redeploy.",
    )
  }
  return delegate
}

function userUpsertFields(user: UserRef) {
  const email = user.email ?? `${user.id}@users.tickward.local`

  return {
    where: { id: user.id },
    update: {
      email,
      role: user.role ?? "user",
    },
    create: {
      id: user.id,
      name: user.email ?? user.id,
      email,
      emailVerified: Boolean(user.email),
      role: user.role ?? "user",
    },
  }
}

function publicAccountPreferences(row: UserPreferenceRow | null | undefined): AccountPreferencesRecord {
  if (!row) return DEFAULT_ACCOUNT_PREFERENCES
  const sound = notificationSoundSchema.safeParse(row.notificationSound)

  return {
    object: "account_preferences",
    default_timezone: row.defaultTimezone,
    email_reminders: row.emailReminders,
    full_page_alarm: row.fullPageAlarm,
    in_app_notifications: row.inAppNotifications !== false,
    notification_sound: sound.success ? sound.data : "none",
    count_up_policy: normalizeCountUpPolicy({
      mode: row.countUpPolicy,
      minutes: row.countUpPolicyMinutes ?? null,
    }),
    count_up_intro_dismissed: row.countUpIntroDismissed === true,
  }
}

export async function getAccountPreferencesForUser(user: UserRef): Promise<AccountPreferencesRecord> {
  const prisma = requirePrismaClient()
  const row = await userPreferenceDelegate(prisma).findUnique({
    where: { userId: user.id },
  })
  return publicAccountPreferences(row)
}

export async function updateAccountPreferencesForUser(
  user: UserRef,
  patch: AccountPreferencesPatch,
): Promise<AccountPreferencesRecord> {
  const data: Record<string, unknown> = {}
  if (patch.default_timezone !== undefined) data.defaultTimezone = patch.default_timezone
  if (patch.email_reminders !== undefined) data.emailReminders = patch.email_reminders
  if (patch.full_page_alarm !== undefined) data.fullPageAlarm = patch.full_page_alarm
  if (patch.in_app_notifications !== undefined) data.inAppNotifications = patch.in_app_notifications
  if (patch.notification_sound !== undefined) data.notificationSound = patch.notification_sound
  if (patch.count_up_policy !== undefined) {
    data.countUpPolicy = patch.count_up_policy.mode
    data.countUpPolicyMinutes = patch.count_up_policy.minutes
  }
  if (patch.count_up_intro_dismissed !== undefined) {
    data.countUpIntroDismissed = patch.count_up_intro_dismissed
  }

  const create = {
    userId: user.id,
    defaultTimezone: typeof data.defaultTimezone === "string" ? data.defaultTimezone : null,
    emailReminders:
      typeof data.emailReminders === "boolean" ? data.emailReminders : DEFAULT_ACCOUNT_PREFERENCES.email_reminders,
    fullPageAlarm:
      typeof data.fullPageAlarm === "boolean" ? data.fullPageAlarm : DEFAULT_ACCOUNT_PREFERENCES.full_page_alarm,
    inAppNotifications:
      typeof data.inAppNotifications === "boolean"
        ? data.inAppNotifications
        : DEFAULT_ACCOUNT_PREFERENCES.in_app_notifications,
    notificationSound:
      typeof data.notificationSound === "string"
        ? data.notificationSound
        : DEFAULT_ACCOUNT_PREFERENCES.notification_sound,
    countUpPolicy:
      typeof data.countUpPolicy === "string" ? data.countUpPolicy : DEFAULT_ACCOUNT_PREFERENCES.count_up_policy.mode,
    countUpPolicyMinutes: typeof data.countUpPolicyMinutes === "number" ? data.countUpPolicyMinutes : null,
    countUpIntroDismissed:
      typeof data.countUpIntroDismissed === "boolean"
        ? data.countUpIntroDismissed
        : DEFAULT_ACCOUNT_PREFERENCES.count_up_intro_dismissed,
  }

  const prisma = requirePrismaClient()
  const row = await prisma.$transaction(async (tx) => {
    const previousRow =
      patch.count_up_policy === undefined
        ? null
        : await userPreferenceDelegate(tx).findUnique({ where: { userId: user.id } })
    const previousPolicy = previousRow
      ? normalizeCountUpPolicy({
          mode: previousRow.countUpPolicy,
          minutes: previousRow.countUpPolicyMinutes ?? null,
        })
      : DEFAULT_ACCOUNT_PREFERENCES.count_up_policy
    await tx.user.upsert(userUpsertFields(user))
    const updatedRow = await userPreferenceDelegate(tx).upsert({
      where: { userId: user.id },
      create,
      update: data,
    })
    const nextPolicy = patch.count_up_policy
    const policyChanged =
      nextPolicy !== undefined &&
      (previousPolicy.mode !== nextPolicy.mode || previousPolicy.minutes !== nextPolicy.minutes)
    if (policyChanged && nextPolicy.mode !== "move-directly-to-past") {
      const durationMs = countUpPolicyDurationMs(nextPolicy)
      const rearmedAt = new Date()
      await tx.countUpOccurrence.updateMany({
        where: {
          userId: user.id,
          firstSeenAt: { not: null },
          acknowledgedAt: null,
          deferredUntil: null,
          usesDefaultPolicy: true,
        },
        data: {
          policyMode: nextPolicy.mode,
          policyMinutes: nextPolicy.minutes,
          reviewExpiresAt: durationMs === null ? null : new Date(rearmedAt.getTime() + durationMs),
        },
      })
    }
    return updatedRow
  })

  return publicAccountPreferences(row)
}
