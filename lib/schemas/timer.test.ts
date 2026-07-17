import { beforeEach, describe, expect, it } from "vitest"

import { setActiveLocale } from "@/lib/i18n/active-locale"
import {
  REMINDER_OFFSET_MAX_MINUTES,
  durationTotalSeconds,
  isTimerFormStepValid,
  normalizeTimerUrl,
  quickAddTimerFormSchema,
  timerFormSchema,
  timerAfterZeroFromForm,
  timerSchema,
  type TimerFormValues,
} from "@/lib/schemas/timer"

beforeEach(() => {
  setActiveLocale("en")
})

describe("normalizeTimerUrl", () => {
  it("returns an empty string for blank input", () => {
    expect(normalizeTimerUrl("")).toBe("")
    expect(normalizeTimerUrl("   ")).toBe("")
  })

  it("keeps a clean http(s) URL", () => {
    expect(normalizeTimerUrl("https://example.com/path")).toBe("https://example.com/path")
    expect(normalizeTimerUrl("  http://example.com/a  ")).toBe("http://example.com/a")
  })

  it("strips query strings and fragments", () => {
    expect(normalizeTimerUrl("https://example.com/p?a=1&b=2")).toBe("https://example.com/p")
    expect(normalizeTimerUrl("https://example.com/p#section")).toBe("https://example.com/p")
    expect(normalizeTimerUrl("https://example.com/p?x=1#y")).toBe("https://example.com/p")
  })

  it("rejects non-http(s) schemes (XSS-safe)", () => {
    expect(normalizeTimerUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeTimerUrl("data:text/html,<script>")).toBeNull()
    expect(normalizeTimerUrl("ftp://example.com")).toBeNull()
  })

  it("rejects values that are not absolute URLs", () => {
    expect(normalizeTimerUrl("example.com")).toBeNull()
    expect(normalizeTimerUrl("/relative/path")).toBeNull()
    expect(normalizeTimerUrl("not a url")).toBeNull()
  })
})

describe("timer reminders schema", () => {
  const baseTimer = {
    id: "timer-a",
    label: "Launch",
    targetDate: "2026-05-25T12:00:00.000Z",
    timezone: "Europe/Warsaw",
    createdAt: "2026-05-20T00:00:00.000Z",
  }

  it("accepts up to five reminder offsets inside the allowed range", () => {
    expect(
      timerSchema.safeParse({
        ...baseTimer,
        reminders: [
          { offsetMinutes: 0 },
          { offsetMinutes: 10 },
          { offsetMinutes: 60 },
          { offsetMinutes: 1440 },
          { offsetMinutes: REMINDER_OFFSET_MAX_MINUTES },
        ],
      }).success,
    ).toBe(true)
  })

  it("rejects too many, out-of-bounds, or duplicate reminder offsets", () => {
    expect(
      timerSchema.safeParse({
        ...baseTimer,
        reminders: [
          { offsetMinutes: 0 },
          { offsetMinutes: 1 },
          { offsetMinutes: 2 },
          { offsetMinutes: 3 },
          { offsetMinutes: 4 },
          { offsetMinutes: 5 },
        ],
      }).success,
    ).toBe(false)

    expect(
      timerSchema.safeParse({
        ...baseTimer,
        reminders: [{ offsetMinutes: -1 }],
      }).success,
    ).toBe(false)
    expect(
      timerSchema.safeParse({
        ...baseTimer,
        reminders: [{ offsetMinutes: REMINDER_OFFSET_MAX_MINUTES + 1 }],
      }).success,
    ).toBe(false)
    expect(
      timerSchema.safeParse({
        ...baseTimer,
        reminders: [{ offsetMinutes: 10 }, { offsetMinutes: 10 }],
      }).success,
    ).toBe(false)
  })
})

describe("since timer schema", () => {
  const baseTimer = {
    id: "timer-since",
    label: "Together",
    targetDate: "2020-05-25T12:00:00.000Z",
    timezone: "Europe/Warsaw",
    createdAt: "2026-05-20T00:00:00.000Z",
  }
  const milestones = { rules: [{ unit: "years" as const, every: 1 }] }

  it("accepts a since timer with milestones and no recurrence or after-zero policy", () => {
    expect(timerSchema.safeParse({ ...baseTimer, mode: "since", milestones }).success).toBe(true)
  })

  it.each([
    [{ ...baseTimer, mode: "since" }, ["milestones"]],
    [
      {
        ...baseTimer,
        mode: "since",
        milestones,
        recurrence: { type: "yearly", enabled: true },
      },
      ["recurrence"],
    ],
    [
      {
        ...baseTimer,
        mode: "since",
        milestones,
        afterZero: { mode: "until-reviewed" },
      },
      ["afterZero"],
    ],
    [{ ...baseTimer, milestones }, ["milestones"]],
  ])("rejects invalid since-timer combinations on the relevant path", (value, path) => {
    const result = timerSchema.safeParse(value)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path })]))
  })

  it("keeps legacy timers without mode backward-compatible", () => {
    expect(timerSchema.safeParse(baseTimer).success).toBe(true)
  })
})

const baseTimerFormValues: TimerFormValues = {
  label: "Launch",
  description: "",
  url: "",
  scheduleMode: "at",
  timerMode: "until",
  milestoneRules: [],
  date: "2026-06-06",
  time: "09:00",
  timezone: "UTC",
  durationDays: "00",
  durationHours: "00",
  durationMinutes: "10",
  durationSeconds: "00",
  notify: true,
  reminders: [],
  repeatEnabled: false,
  repeatType: "yearly",
  lastDay: false,
  spaceId: "",
  image: null,
  afterZeroMode: "use-default",
  afterZeroMinutes: "30",
}

describe("timer form schema", () => {
  it("requires a past anchor and milestone rules for since timers", () => {
    const valid = timerFormSchema.safeParse({
      ...baseTimerFormValues,
      timerMode: "since",
      date: "2020-06-06",
      notify: false,
      milestoneRules: [{ unit: "years", every: 1 }],
    })
    expect(valid.success).toBe(true)

    const missingRules = timerFormSchema.safeParse({
      ...baseTimerFormValues,
      timerMode: "since",
      date: "2020-06-06",
      notify: false,
    })
    expect(missingRules.success).toBe(false)
    if (!missingRules.success) {
      expect(missingRules.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["milestoneRules"] })]),
      )
    }

    const futureAnchor = timerFormSchema.safeParse({
      ...baseTimerFormValues,
      timerMode: "since",
      date: "2099-06-06",
      notify: false,
      milestoneRules: [{ unit: "days", every: 100 }],
    })
    expect(futureAnchor.success).toBe(false)
    if (!futureAnchor.success) {
      expect(futureAnchor.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ["date"] })]))
    }
  })

  it("validates and maps timer-specific after-zero overrides", () => {
    expect(
      timerSchema.safeParse({
        id: "timer-a",
        label: "Launch",
        targetDate: "2026-05-25T12:00:00.000Z",
        timezone: "UTC",
        createdAt: "2026-05-20T00:00:00.000Z",
        afterZero: { mode: "keep-visible", minutes: 45 },
      }).success,
    ).toBe(true)
    expect(
      timerAfterZeroFromForm({
        afterZeroMode: "keep-visible-1h",
        afterZeroMinutes: "30",
      }),
    ).toEqual({
      mode: "keep-visible",
      minutes: 60,
    })
    expect(
      timerAfterZeroFromForm({
        afterZeroMode: "keep-visible-custom",
        afterZeroMinutes: "45",
      }),
    ).toEqual({
      mode: "keep-visible",
      minutes: 45,
    })
  })

  it("rejects invalid custom after-zero minutes", () => {
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        afterZeroMode: "keep-visible-custom",
        afterZeroMinutes: "0",
      }).success,
    ).toBe(false)
  })

  it("allows empty labels for submit-time default naming", () => {
    expect(timerFormSchema.safeParse({ ...baseTimerFormValues, label: "   " }).success).toBe(true)
    expect(
      quickAddTimerFormSchema.safeParse({
        label: "",
        scheduleMode: "at",
        date: "2026-06-06",
        time: "09:00",
        timezone: "UTC",
        durationDays: "00",
        durationHours: "00",
        durationMinutes: "10",
        durationSeconds: "00",
      }).success,
    ).toBe(true)
  })

  it("keeps absolute date and time required in date-time mode", () => {
    expect(timerFormSchema.safeParse({ ...baseTimerFormValues, date: "", time: "" }).success).toBe(false)
    expect(timerFormSchema.safeParse(baseTimerFormValues).success).toBe(true)
  })

  it("uses localized schedule validation messages", () => {
    const invalidDateTime = timerFormSchema.safeParse({
      ...baseTimerFormValues,
      date: "",
      time: "",
    })
    expect(invalidDateTime.success).toBe(false)
    if (!invalidDateTime.success) {
      expect(invalidDateTime.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: "Pick a valid date.",
            path: ["date"],
          }),
          expect.objectContaining({
            message: "Pick a valid time.",
            path: ["time"],
          }),
        ]),
      )
    }

    const invalidDuration = timerFormSchema.safeParse({
      ...baseTimerFormValues,
      scheduleMode: "in",
      durationDays: "00",
      durationHours: "00",
      durationMinutes: "00",
      durationSeconds: "00",
    })
    expect(invalidDuration.success).toBe(false)
    if (!invalidDuration.success) {
      expect(invalidDuration.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: "Duration must be at least 1 second.",
            path: ["durationMinutes"],
          }),
        ]),
      )
    }

    setActiveLocale("pl")
    const localizedInvalidDuration = timerFormSchema.safeParse({
      ...baseTimerFormValues,
      scheduleMode: "in",
      durationDays: "00",
      durationHours: "00",
      durationMinutes: "00",
      durationSeconds: "00",
    })
    expect(localizedInvalidDuration.success).toBe(false)
    if (!localizedInvalidDuration.success) {
      expect(localizedInvalidDuration.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: "Czas musi wynosić co najmniej 1 sekundę.",
            path: ["durationMinutes"],
          }),
        ]),
      )
    }
  })

  it("makes date and time optional in duration mode", () => {
    const values: TimerFormValues = {
      ...baseTimerFormValues,
      scheduleMode: "in",
      date: "",
      time: "",
      durationDays: "01",
      durationHours: "00",
      durationMinutes: "00",
      durationSeconds: "00",
    }

    expect(timerFormSchema.safeParse(values).success).toBe(true)
    expect(isTimerFormStepValid(2, values)).toBe(true)
  })

  it("requires duration mode to be at least one second", () => {
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        date: "",
        time: "",
        durationDays: "00",
        durationHours: "00",
        durationMinutes: "00",
        durationSeconds: "00",
      }).success,
    ).toBe(false)
  })

  it("validates duration segment bounds", () => {
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationDays: "00",
        durationMinutes: "00",
        durationSeconds: "01",
      }).success,
    ).toBe(true)
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationDays: "99",
      }).success,
    ).toBe(true)
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationDays: "100",
      }).success,
    ).toBe(false)
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationDays: "1a",
      }).success,
    ).toBe(false)
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationMinutes: "60",
      }).success,
    ).toBe(false)
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationSeconds: "60",
      }).success,
    ).toBe(false)
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationHours: "100",
      }).success,
    ).toBe(false)
    expect(
      timerFormSchema.safeParse({
        ...baseTimerFormValues,
        scheduleMode: "in",
        durationSeconds: "01",
      }).success,
    ).toBe(true)
  })

  it("computes total duration seconds from string segments", () => {
    expect(
      durationTotalSeconds({
        durationDays: "01",
        durationHours: "01",
        durationMinutes: "02",
        durationSeconds: "03",
      }),
    ).toBe(90123)
  })
})
