// The 60-tick dial from the iPhone app: one tick per the largest unit that keeps the count at
// 60 or fewer, so the dial "zooms in" as a date gets close. Mirrors DialScale in the iOS app.

export const TICK_COUNT = 60

export type DialUnit = "second" | "minute" | "hour" | "day" | "week"

const UNIT_LENGTHS: ReadonlyArray<readonly [DialUnit, number]> = [
  ["second", 1],
  ["minute", 60],
  ["hour", 3_600],
  ["day", 86_400],
  ["week", 604_800],
]

export type DialScale = Readonly<{
  unit: DialUnit
  lit: number
  leading: number
}>

export function dialScale(seconds: number): DialScale {
  const magnitude = Math.max(0, seconds)
  const [unit, length] =
    UNIT_LENGTHS.find(([, unitLength]) => magnitude / unitLength <= TICK_COUNT) ?? UNIT_LENGTHS.at(-1)!
  const units = Math.min(TICK_COUNT, magnitude / length)
  const lit = Math.floor(units)
  return { unit, lit, leading: units - lit }
}

export type CountdownParts = Readonly<{ days: number; clock: string }>

export function countdownParts(seconds: number): CountdownParts {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return { days, clock: `${pad(hours)}:${pad(minutes)}:${pad(secs)}` }
}
