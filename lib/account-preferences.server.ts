import "server-only"

import {
  DEFAULT_ACCOUNT_PREFERENCES,
  type AccountPreferencesPatch,
  type AccountPreferencesRecord,
} from "@/lib/account-preferences"
import type { UserRef } from "@/lib/contracts"
import { requirePrismaClient } from "@/lib/db/prisma.server"
import type { Prisma } from "@/lib/generated/prisma/client"
import { notificationSoundSchema } from "@/lib/schemas/timer"

type UserPreferenceRow = {
  defaultTimezone: string | null
  fullPageAlarm: boolean
  notificationSound: string
}

type UserPreferenceDelegate = {
  findUnique(args: { where: { userId: string } }): Promise<UserPreferenceRow | null>
  upsert(args: {
    where: { userId: string }
    create: Prisma.UserPreferenceUncheckedCreateInput
    update: Prisma.UserPreferenceUncheckedUpdateInput
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
    full_page_alarm: row.fullPageAlarm,
    notification_sound: sound.success ? sound.data : "none",
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
  const data: Prisma.UserPreferenceUncheckedUpdateInput = {}
  if (patch.default_timezone !== undefined) data.defaultTimezone = patch.default_timezone
  if (patch.full_page_alarm !== undefined) data.fullPageAlarm = patch.full_page_alarm
  if (patch.notification_sound !== undefined) data.notificationSound = patch.notification_sound

  const create: Prisma.UserPreferenceUncheckedCreateInput = {
    userId: user.id,
    defaultTimezone: typeof data.defaultTimezone === "string" ? data.defaultTimezone : null,
    fullPageAlarm:
      typeof data.fullPageAlarm === "boolean" ? data.fullPageAlarm : DEFAULT_ACCOUNT_PREFERENCES.full_page_alarm,
    notificationSound:
      typeof data.notificationSound === "string"
        ? data.notificationSound
        : DEFAULT_ACCOUNT_PREFERENCES.notification_sound,
  }

  const prisma = requirePrismaClient()
  const row = await prisma.$transaction(async (tx) => {
    await tx.user.upsert(userUpsertFields(user))
    return userPreferenceDelegate(tx).upsert({
      where: { userId: user.id },
      create,
      update: data,
    })
  })

  return publicAccountPreferences(row)
}
