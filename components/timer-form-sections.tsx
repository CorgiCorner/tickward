import { formatInTimeZone } from "date-fns-tz"
import {
  BellIcon,
  BellRingIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  ClockIcon,
  ImageIcon,
  LockIcon,
  PencilIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { Controller, useController, type Control, type UseFormRegister } from "react-hook-form"

import { TimerRemindersField } from "@/components/timer-reminders-field"
import { TimezoneSelect } from "@/components/timezone-select"
import { UnsplashPicker } from "@/components/unsplash-picker"
import { Button } from "@/components/ui/button"
import { DatePicker, DatePresetChips } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DurationPicker, ScheduleModeToggle, TimePicker, type DurationPickerValue } from "@/components/ui/time-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { authClient } from "@/lib/auth/auth-client"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { MILESTONE_PRESETS } from "@/lib/milestone-presets"
import { MILESTONE_UNITS, type MilestoneRule, type MilestoneUnit } from "@/lib/milestones"
import { type TimerFormRecurrenceType, type TimerFormValues } from "@/lib/schemas/timer"
import type { Space } from "@/lib/types"

const TIMER_FORM_STEPS = ["timer.form.basics", "timer.form.schedule", "timer.form.customize"] as const

// Small per-section glyphs (pen / clock / photo) shown in the stepper and in the
// edit view section headers so each part of the form is scannable at a glance.
const TIMER_FORM_STEP_ICONS: ComponentType<{ className?: string }>[] = [PencilIcon, ClockIcon, ImageIcon]
const RECURRENCE_TYPES: TimerFormRecurrenceType[] = ["daily", "weekly", "monthly", "yearly"]
const RECURRENCE_TYPE_LABEL_KEYS: Record<TimerFormRecurrenceType, MessageKey> = {
  daily: "timer.form.recurrence.daily",
  weekly: "timer.form.recurrence.weekly",
  monthly: "timer.form.recurrence.monthly",
  yearly: "timer.form.recurrence.yearly",
}
// references: timer.form.mode.until / timer.form.mode.since
// references: timer.form.milestones.unit.days / timer.form.milestones.unit.weeks
// references: timer.form.milestones.unit.months / timer.form.milestones.unit.years

function parseMilestoneAmounts(value: string): number[] {
  return value
    .split(",")
    .map((amount) => amount.trim())
    .filter(Boolean)
    .map(Number)
}

function ExplicitMilestoneAmountsInput(
  props: Readonly<{ rule: Extract<MilestoneRule, { at: number[] }>; onChange: (at: number[]) => void }>,
) {
  const serialized = props.rule.at.join(", ")
  const inputRef = useRef<HTMLInputElement>(null)
  const lastEmitted = useRef(props.rule.at.join(","))

  useEffect(() => {
    const canonical = props.rule.at.join(",")
    if (canonical === lastEmitted.current) return
    lastEmitted.current = canonical
    if (inputRef.current) inputRef.current.value = serialized
  }, [props.rule.at, serialized])

  return (
    <Input
      aria-label={formatMessage("timer.form.milestones.amounts")}
      ref={inputRef}
      inputMode="numeric"
      placeholder={formatMessage("timer.form.milestones.amountsPlaceholder")}
      defaultValue={serialized}
      onChange={(event) => {
        const nextValue = event.target.value
        const at = parseMilestoneAmounts(nextValue)
        lastEmitted.current = at.join(",")
        props.onChange(at)
      }}
    />
  )
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

function SchedulePreview(props: Readonly<{ dates: string[]; timezone: string }>) {
  if (props.dates.length === 0) return null
  return (
    <div className="text-xs text-muted-foreground">
      {formatMessage("timer.form.nextPreview")}{" "}
      <span className="text-foreground">{repeatPreviewLabel(props.dates, props.timezone)}</span>
    </div>
  )
}

function MilestoneModeButton(
  props: Readonly<{
    active: boolean
    labelKey: MessageKey
    tooltipKey: MessageKey
    onClick: () => void
  }>,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={props.active}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${props.active ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={props.onClick}
        >
          {formatMessage(props.labelKey)}
          <CircleHelpIcon aria-hidden="true" className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[260px] text-center">
        {formatMessage(props.tooltipKey)}
      </TooltipContent>
    </Tooltip>
  )
}

function TimerMilestonesField(
  props: Readonly<{
    control: Control<TimerFormValues>
    preview: string[]
    timezone: string
  }>,
) {
  return (
    <Controller
      control={props.control}
      name="milestoneRules"
      render={({ field, fieldState }) => {
        const rules = field.value ?? []
        return (
          <div className="grid gap-3 rounded-xl border border-border p-3">
            <div>
              <div className="text-sm font-medium">{formatMessage("timer.form.milestones.title")}</div>
              <p className="mt-1 text-xs text-muted-foreground">{formatMessage("timer.form.milestones.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {MILESTONE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => field.onChange(preset.rules)}
                >
                  {formatMessage(preset.labelKey)}
                </button>
              ))}
            </div>
            {rules.map((rule, index) => (
              <div key={`${index}-${rule.unit}`} className="grid gap-2 rounded-lg border border-border/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex rounded-lg border border-border p-0.5">
                    <MilestoneModeButton
                      active={"every" in rule}
                      labelKey="timer.form.milestones.modeEvery"
                      tooltipKey="timer.form.milestones.modeEveryTooltip"
                      onClick={() => {
                        if ("every" in rule) return
                        const next = [...rules]
                        next[index] = { unit: rule.unit, every: 1 }
                        field.onChange(next)
                      }}
                    />
                    <MilestoneModeButton
                      active={"at" in rule}
                      labelKey="timer.form.milestones.modeAt"
                      tooltipKey="timer.form.milestones.modeAtTooltip"
                      onClick={() => {
                        if ("at" in rule) return
                        const next = [...rules]
                        next[index] = { unit: rule.unit, at: [1] }
                        field.onChange(next)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={formatMessage("timer.form.milestones.removeRule")}
                    className="text-lg text-muted-foreground hover:text-foreground"
                    onClick={() => field.onChange(rules.filter((_, candidate) => candidate !== index))}
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,auto)] items-center gap-2">
                  {"every" in rule ? (
                    <Input
                      aria-label={formatMessage("timer.form.milestones.every")}
                      type="number"
                      min={1}
                      max={1000}
                      value={rule.every}
                      onChange={(event) => {
                        const next = [...rules]
                        next[index] = { ...rule, every: Number(event.target.value) }
                        field.onChange(next)
                      }}
                    />
                  ) : (
                    <ExplicitMilestoneAmountsInput
                      rule={rule}
                      onChange={(at) => {
                        const next = [...rules]
                        next[index] = { ...rule, at }
                        field.onChange(next)
                      }}
                    />
                  )}
                  <Select
                    value={rule.unit}
                    onValueChange={(value) => {
                      const next = [...rules]
                      next[index] = { ...rule, unit: value as MilestoneUnit }
                      field.onChange(next)
                    }}
                  >
                    <SelectTrigger aria-label={formatMessage("timer.form.milestones.unit")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MILESTONE_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {formatMessage(`timer.form.milestones.unit.${unit}` as MessageKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            {rules.length < 4 ? (
              <button
                type="button"
                className="justify-self-start text-xs font-medium text-primary"
                onClick={() => field.onChange([...rules, { unit: "years", every: 1 }])}
              >
                + {formatMessage("timer.form.milestones.addRule")}
              </button>
            ) : null}
            {fieldState.error ? <p className="text-xs text-destructive">{fieldState.error.message}</p> : null}
            <SchedulePreview dates={props.preview} timezone={props.timezone} />
          </div>
        )
      }}
    />
  )
}

export function TimerFormStepper(props: Readonly<{ step: number }>) {
  return (
    <div className="flex items-center justify-center gap-1">
      {TIMER_FORM_STEPS.map((labelKey, i) => {
        const stepNumber = i + 1
        const active = stepNumber === props.step
        const done = stepNumber < props.step
        const Icon = TIMER_FORM_STEP_ICONS[i]

        return (
          <div key={labelKey} className="flex items-center gap-1">
            {i > 0 && <div className={["h-px w-4 transition-colors", done ? "bg-primary" : "bg-border"].join(" ")} />}
            <span
              className={[
                "inline-flex items-center gap-1 text-xs transition-colors",
                stepLabelClassName({ active, done }),
              ].join(" ")}
            >
              {Icon ? <Icon className="size-3.5" /> : null}
              {formatMessage(labelKey)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Compact icon + title used to delimit each section in the all-at-once edit view.
export function TimerFormSectionHeading(props: Readonly<{ step: number; labelKey: MessageKey }>) {
  const Icon = TIMER_FORM_STEP_ICONS[props.step - 1]
  return (
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {Icon ? <Icon className="size-3.5" /> : null}
      {formatMessage(props.labelKey)}
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
    labelPlaceholder: string
    detailsCollapsed?: boolean
  }>,
) {
  const { control, register, spaces } = props
  const [detailsOpen, setDetailsOpen] = useState(!props.detailsCollapsed)

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="label">{formatMessage("timer.form.label")}</Label>
        <Input id="label" maxLength={60} placeholder={props.labelPlaceholder} autoFocus {...register("label")} />
        <div className="text-xs text-muted-foreground">{props.labelLength}/60</div>
      </div>

      {props.detailsCollapsed ? (
        <button
          type="button"
          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {formatMessage("timer.form.details")}
          <ChevronDownIcon
            className={["size-4 text-muted-foreground transition-transform", detailsOpen ? "rotate-180" : ""].join(" ")}
          />
        </button>
      ) : null}

      {detailsOpen ? (
        <div className="grid gap-4">
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

          <Controller
            control={control}
            name="url"
            render={({ field, fieldState }) => (
              <div className="grid gap-2">
                <Label htmlFor="url">{formatMessage("timer.form.url")}</Label>
                <Input
                  id="url"
                  type="url"
                  inputMode="url"
                  maxLength={2048}
                  placeholder={formatMessage("timer.form.urlPlaceholder")}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
                {fieldState.error ? <div className="text-xs text-destructive">{fieldState.error.message}</div> : null}
              </div>
            )}
          />

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
        </div>
      ) : null}
    </>
  )
}

function TimerDurationField(props: Readonly<{ control: Control<TimerFormValues> }>) {
  const days = useController({ control: props.control, name: "durationDays" })
  const hours = useController({
    control: props.control,
    name: "durationHours",
  })
  const minutes = useController({
    control: props.control,
    name: "durationMinutes",
  })
  const seconds = useController({
    control: props.control,
    name: "durationSeconds",
  })
  const value: DurationPickerValue = {
    durationDays: days.field.value,
    durationHours: hours.field.value,
    durationMinutes: minutes.field.value,
    durationSeconds: seconds.field.value,
  }

  return (
    <DurationPicker
      value={value}
      onChange={(next) => {
        days.field.onChange(next.durationDays)
        hours.field.onChange(next.durationHours)
        minutes.field.onChange(next.durationMinutes)
        seconds.field.onChange(next.durationSeconds)
      }}
    />
  )
}

export function TimerScheduleSection(
  props: Readonly<{
    control: Control<TimerFormValues>
    allowScheduleMode?: boolean
    localTz: string
    timezone: string
    scheduleMode: TimerFormValues["scheduleMode"]
    repeatEnabled: boolean
    repeatType: TimerFormRecurrenceType
    repeatPreview: string[]
    timerMode: TimerFormValues["timerMode"]
    milestonePreview: string[]
    isPastDate: boolean
    directionSuggestion?: "since" | "until"
    focusDateOnMount?: boolean
    livePreview?: string
    onNotifyChange: (checked: boolean) => void
    onTimerModeChange: (mode: TimerFormValues["timerMode"]) => void
    timerModeLocked?: boolean
    lockedDirectionAction?: ReactNode
  }>,
) {
  const { control } = props
  const session = authClient.useSession()
  const signedIn = Boolean(session.data?.user)
  const durationMode = props.allowScheduleMode === true && props.scheduleMode === "in"
  const sinceMode = props.timerMode === "since"
  const directionSuggestion = props.directionSuggestion

  return (
    <>
      <div className="grid gap-2">
        <Label>{formatMessage("timer.form.mode.label")}</Label>
        {props.timerModeLocked ? (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>
                {formatMessage(
                  props.timerMode === "since" ? "timer.form.mode.lockedSince" : "timer.form.mode.lockedUntil",
                )}
              </span>
              <LockIcon className="size-3.5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-xs text-muted-foreground">{formatMessage("timer.form.mode.lockedDescription")}</p>
            {props.lockedDirectionAction}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(["until", "since"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={props.timerMode === mode}
                  className={[
                    "rounded-lg border px-3 py-2 text-xs transition-colors",
                    props.timerMode === mode
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                  onClick={() => props.onTimerModeChange(mode)}
                >
                  {formatMessage(`timer.form.mode.${mode}` as MessageKey)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{formatMessage("timer.form.mode.description")}</p>
          </>
        )}
      </div>

      {props.allowScheduleMode && !sinceMode ? (
        <Controller
          control={control}
          name="scheduleMode"
          render={({ field }) => <ScheduleModeToggle value={field.value ?? "at"} onChange={field.onChange} compact />}
        />
      ) : null}

      {durationMode ? (
        <TimerDurationField control={control} />
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Controller
              control={control}
              name="date"
              render={({ field }) => (
                <div className="grid min-w-0 gap-2" data-timer-date-field>
                  <Label>{formatMessage("timer.form.date")}</Label>
                  <DatePicker value={field.value} onChange={field.onChange} focusOnMount={props.focusDateOnMount} />
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

          {directionSuggestion ? (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <p className="text-xs">
                {formatMessage(
                  directionSuggestion === "since"
                    ? "timer.form.directionSuggestion.since"
                    : "timer.form.directionSuggestion.until",
                )}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 bg-transparent px-2 text-xs"
                onClick={() => props.onTimerModeChange(directionSuggestion)}
              >
                {formatMessage(
                  directionSuggestion === "since"
                    ? "timer.form.directionSuggestion.switchSince"
                    : "timer.form.directionSuggestion.switchUntil",
                )}
              </Button>
            </div>
          ) : null}

          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DatePresetChips direction={sinceMode ? "past" : "future"} onChange={field.onChange} />
            )}
          />

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
        </>
      )}

      {sinceMode ? (
        <TimerMilestonesField control={control} preview={props.milestonePreview} timezone={props.timezone} />
      ) : null}

      {props.livePreview ? (
        <p className="rounded-lg bg-primary/[0.035] px-3 py-2 text-sm font-medium text-foreground" aria-live="polite">
          {props.livePreview}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border p-3">
        <div className="text-sm font-medium">{formatMessage("timer.form.alertsReminders")}</div>
        {!sinceMode ? (
          <Controller
            control={control}
            name="notify"
            render={({ field }) => (
              <div
                className={["rounded-lg p-3 transition-colors", field.value ? "bg-primary/[0.03]" : "bg-muted/30"].join(
                  " ",
                )}
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
                  <Switch
                    id="notify"
                    checked={field.value}
                    onCheckedChange={(checked) => props.onNotifyChange(checked)}
                  />
                </div>
                {field.value && props.isPastDate ? (
                  <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    {formatMessage("notifications.futureOnly.inline")}
                  </p>
                ) : null}
              </div>
            )}
          />
        ) : null}
        <div className="border-t pt-3">
          <TimerRemindersField control={control} />
          {!signedIn ? (
            <p className="mt-2 text-xs text-muted-foreground">{formatMessage("timer.form.reminders.signInHint")}</p>
          ) : null}
        </div>
      </div>

      {!durationMode && !sinceMode ? (
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
              <SchedulePreview dates={props.repeatPreview} timezone={props.timezone} />
            </>
          ) : null}
        </div>
      ) : null}
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
