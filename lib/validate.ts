import type { Space, Timer } from "./types"
import { formatMessage } from "./i18n/messages"
import {
  colorSchema,
  imageUrlSchema,
  photoIdSchema,
  spaceArraySchema,
  spacesPayloadSchema,
  targetDateSchema,
  timerArraySchema,
  timersPayloadSchema,
  timezoneSchema,
} from "./schemas/timer"

function firstIssueMessage(
  result: ReturnType<typeof timersPayloadSchema.safeParse> | ReturnType<typeof spacesPayloadSchema.safeParse>,
) {
  return result.success ? null : (result.error.issues[0]?.message ?? formatMessage("validation.invalidPayload"))
}

export function isValidColor(value: unknown): boolean {
  return colorSchema.safeParse(value).success
}

export function isValidImageUrl(value: unknown): boolean {
  return imageUrlSchema.safeParse(value).success
}

export function isValidTargetDate(value: string): boolean {
  return targetDateSchema.safeParse(value).success
}

export function isValidTimezone(value: string): boolean {
  return timezoneSchema.safeParse(value).success
}

export function isValidPhotoId(value: unknown): boolean {
  return photoIdSchema.safeParse(value).success
}

export function isTimerArray(value: unknown): value is Timer[] {
  return timerArraySchema.safeParse(value).success
}

export function validateTimersPayload(timers: Timer[]): string | null {
  return firstIssueMessage(timersPayloadSchema.safeParse(timers))
}

export function isSpaceArray(value: unknown): value is Space[] {
  return spaceArraySchema.safeParse(value).success
}

export function validateSpacesPayload(spaces: Space[]): string | null {
  return firstIssueMessage(spacesPayloadSchema.safeParse(spaces))
}
