export type TimePickerType = "hours" | "minutes"

export function isValidHour(value: string) {
  return /^(0\d|1\d|2[0-3])$/.test(value)
}

export function isValidMinute(value: string) {
  return /^[0-5]\d$/.test(value)
}

function getValidNumber(value: string, { max, min = 0, loop = false }: { max: number; min?: number; loop?: boolean }) {
  let n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) return "00"
  if (loop) {
    if (n > max) n = min
    if (n < min) n = max
  } else {
    if (n > max) n = max
    if (n < min) n = min
  }
  return n.toString().padStart(2, "0")
}

export function getValidHour(value: string) {
  if (isValidHour(value)) return value
  return getValidNumber(value, { max: 23 })
}

export function getValidMinute(value: string) {
  if (isValidMinute(value)) return value
  return getValidNumber(value, { max: 59 })
}

export function getArrowByType(value: string, step: number, type: TimePickerType) {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) return "00"
  const newVal = n + step
  if (type === "hours") return getValidNumber(String(newVal), { min: 0, max: 23, loop: true })
  return getValidNumber(String(newVal), { min: 0, max: 59, loop: true })
}

export function getDateByType(date: Date, type: TimePickerType) {
  if (type === "hours") return getValidHour(String(date.getHours()))
  return getValidMinute(String(date.getMinutes()))
}

export function setDateByType(date: Date, value: string, type: TimePickerType) {
  if (type === "hours") {
    date.setHours(Number.parseInt(getValidHour(value), 10))
  } else {
    date.setMinutes(Number.parseInt(getValidMinute(value), 10))
  }
  return date
}
