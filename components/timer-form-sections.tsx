import { formatInTimeZone } from "date-fns-tz"
import { BellIcon, BellRingIcon } from "lucide-react"
import type { Control, UseFormRegister } from "react-hook-form"
import { Controller } from "react-hook-form"

import { TimezoneSelect } from "@/components/timezone-select"
import { UnsplashPicker } from "@/components/unsplash-picker"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TimePicker } from "@/components/ui/time-picker"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import type { TimerFormRecurrenceType, TimerFormValues } from "@/lib/schemas/timer"
import type { Space } from "@/lib/types"

const TIMER_FORM_STEPS = ["timer.form.basics", "timer.form.schedule", "timer.form.customize"] as const
const RECURRENCE_TYPES: TimerFormRecurrenceType[] = ["daily", "weekly", "monthly", "yearly"]
const RECURRENCE_TYPE_LABEL_KEYS: Record<TimerFormRecurrenceType, MessageKey> = {
  daily: "timer.form.recurrence.daily",
  weekly: "timer.form.recurrence.weekly",
  monthly: "timer.form.recurrence.monthly",
  yearly: "timer.form.recurrence.yearly",
}

function stepLabelClassName(args: { active: boolean; done: boolean }) {
  if (args.active) return "font-medium text-primary"
  if (args.done) return "text-muted-foreground"
  return "text-muted-foreground/50"
}

export function repeatPreviewLabel(dates: string[], timezone: string) {
  const years = new Set(dates.map((date) => formatInTimeZone(date, timezone, "yyyy")))
  const pattern = years.size > 1 ? "MMM d, yyyy, HH:mm" : "MMM d, HH:mm"
  return `${dates.map((date) => formatInTimeZone(date, timezone, pattern)).join(" -> ")} ...`
}

export function TimerFormStepper(props: Readonly<{ step: number }>) {
  return (
    <div className="flex items-center justify-center gap-1">
      {TIMER_FORM_STEPS.map((labelKey, i) => {
        const stepNumber = i + 1
        const active = stepNumber === props.step
        const done = stepNumber < props.step

        return (
          <div key={labelKey} className="flex items-center gap-1">
            {i > 0 && <div className={["h-px w-4 transition-colors", done ? "bg-primary" : "bg-border"].join(" ")} />}
            <span className={["text-xs transition-colors", stepLabelClassName({ active, done })].join(" ")}>
              {formatMessage(labelKey)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function TimerBasicsSection(
  props: Readonly<{
    control: Control<TimerFormValues>
    register: UseFormRegister<TimerFormValues>
    spaces: Space[]
    labelLength: number
    descriptionLength: number
  }>,
) {
  const { control, register, spaces } = props

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="label">{formatMessage("timer.form.label")}</Label>
        <Input
          id="label"
          maxLength={60}
          placeholder={formatMessage("timer.form.labelPlaceholder")}
          autoFocus
          {...register("label")}
        />
        <div className="text-xs text-muted-foreground">{props.labelLength}/60</div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">{formatMessage("timer.form.description")}</Label>
        <textarea
          id="description"
          maxLength={200}
          placeholder={formatMessage("timer.form.descriptionPlaceholder")}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...register("description")}
        />
        <div className="text-xs text-muted-foreground">{props.descriptionLength}/200</div>
      </div>

      {spaces.length > 0 ? (
        <Controller
          control={control}
          name="spaceId"
          render={({ field }) => (
            <div className="grid gap-2">
              <Label>{formatMessage("timer.form.space")}</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    field.value
                      ? "border-border text-muted-foreground hover:text-foreground"
                      : "border-primary bg-primary text-primary-foreground",
                  ].join(" ")}
                  onClick={() => field.onChange("")}
                >
                  {formatMessage("timer.form.noneSpace")}
                </button>
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    className={[
                      "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                      field.value === space.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                    onClick={() => field.onChange(space.id)}
                  >
                    <span
                      className="size-2 rounded-full bg-muted-foreground"
                      style={space.color ? { backgroundColor: space.color } : undefined}
                    />
                    <span className="truncate">{space.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        />
      ) : null}
    </>
  )
}

export function TimerScheduleSection(
  props: Readonly<{
    control: Control<TimerFormValues>
    localTz: string
    timezone: string
    repeatEnabled: boolean
    repeatType: TimerFormRecurrenceType
    repeatPreview: string[]
    isPastDate: boolean
    onNotifyChange: (checked: boolean) => void
  }>,
) {
  const { control } = props

  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <div className="grid min-w-0 gap-2">
              <Label>{formatMessage("timer.form.date")}</Label>
              <DatePicker value={field.value} onChange={field.onChange} />
            </div>
          )}
        />
        <Controller
          control={control}
          name="time"
          render={({ field }) => (
            <div className="grid min-w-0 gap-2">
              <Label>{formatMessage("timer.form.time")}</Label>
              <TimePicker value={field.value} onChange={field.onChange} />
            </div>
          )}
        />
      </div>

      <Controller
        control={control}
        name="timezone"
        render={({ field }) => (
          <div className="grid gap-2">
            <Label>{formatMessage("timer.form.timezone")}</Label>
            <TimezoneSelect value={field.value} onChange={field.onChange} localTz={props.localTz} />
          </div>
        )}
      />

      <Controller
        control={control}
        name="notify"
        render={({ field }) => (
          <div
            className={[
              "rounded-xl border p-3 transition-colors",
              field.value ? "border-primary/30 bg-primary/[0.03]" : "border-border",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <div
                  className={[
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border",
                    field.value ? "border-primary/30 text-primary" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {field.value ? <BellRingIcon className="size-4" /> : <BellIcon className="size-4" />}
                </div>
                <div className="min-w-0">
                  <Label htmlFor="notify" className="text-sm font-medium">
                    {formatMessage("timer.form.notifyMe")}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMessage(
                      field.value && !props.isPastDate
                        ? "notifications.timerAlarm.ready"
                        : "notifications.timerAlarm.description",
                    )}
                  </p>
                </div>
              </div>
              <Switch id="notify" checked={field.value} onCheckedChange={(checked) => props.onNotifyChange(checked)} />
            </div>
            {field.value && props.isPastDate ? (
              <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                {formatMessage("notifications.futureOnly.inline")}
              </p>
            ) : null}
          </div>
        )}
      />

      <div className="grid gap-2">
        <Controller
          control={control}
          name="repeatEnabled"
          render={({ field }) => (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="repeat"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                className="size-4 rounded border accent-primary"
              />
              <Label htmlFor="repeat" className="text-sm font-normal">
                {formatMessage("timer.form.repeat")}
              </Label>
            </div>
          )}
        />
        {props.repeatEnabled ? (
          <>
            <div className="text-xs text-muted-foreground">{formatMessage("timer.form.repeatDescription")}</div>
            <Controller
              control={control}
              name="repeatType"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {RECURRENCE_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={[
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        field.value === type
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                      onClick={() => field.onChange(type)}
                    >
                      {formatMessage(RECURRENCE_TYPE_LABEL_KEYS[type])}
                    </button>
                  ))}
                </div>
              )}
            />
            {props.repeatType === "monthly" ? (
              <Controller
                control={control}
                name="lastDay"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="size-3.5 rounded border accent-primary"
                    />
                    <span>{formatMessage("timer.form.lastDayOfMonth")}</span>
                  </label>
                )}
              />
            ) : null}
            {props.repeatPreview.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                {formatMessage("timer.form.nextPreview")}{" "}
                <span className="text-foreground">{repeatPreviewLabel(props.repeatPreview, props.timezone)}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  )
}

export function TimerCustomizeSection(props: Readonly<{ control: Control<TimerFormValues> }>) {
  return (
    <Controller
      control={props.control}
      name="image"
      render={({ field }) => (
        <div className="grid gap-2">
          <Label>{formatMessage("timer.form.photo")}</Label>
          <UnsplashPicker value={field.value} onChange={field.onChange} />
        </div>
      )}
    />
  )
}
