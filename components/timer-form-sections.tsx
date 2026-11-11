import { formatInTimeZone } from "date-fns-tz"
import { CalendarIcon, CircleHelpIcon, LockIcon, PlusIcon, TimerIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Controller, useController, type Control, type UseFormRegister } from "react-hook-form"

import { MENU_MOTION_CLASSNAME } from "@/components/dashboard/motion"
import { CHIP_CLASS, TimerReminderChips, chipStateClass } from "@/components/timer-form/reminder-chips"
import { Collapsible, FadeInText, PresenceRow, RevealRow, SmoothHeight } from "@/components/timer-form/reveal"
import { TimezoneSelect } from "@/components/timezone-select"
import { UnsplashPicker } from "@/components/unsplash-picker"
import { Button } from "@/components/ui/button"
import { DatePicker, DatePresetChips } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DurationPicker, TimePicker, type DurationPickerValue } from "@/components/ui/time-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import { MILESTONE_PRESETS } from "@/lib/milestone-presets"
import { MILESTONE_UNITS, type MilestoneRule, type MilestoneUnit } from "@/lib/milestones"
import { MAX_TIMER_REMINDERS, type TimerFormRecurrenceType, type TimerFormValues } from "@/lib/schemas/timer"
import type { Space } from "@/lib/types"
import { cn } from "@/lib/utils"

const RECURRENCE_TYPES: TimerFormRecurrenceType[] = ["daily", "weekly", "monthly", "yearly"]
const RECURRENCE_TYPE_LABEL_KEYS: Record<TimerFormRecurrenceType, MessageKey> = {
  daily: "timer.form.recurrence.daily",
  weekly: "timer.form.recurrence.weekly",
  monthly: "timer.form.recurrence.monthly",
  yearly: "timer.form.recurrence.yearly",
}
const NO_REPEAT = "none"

type AfterZeroMode = TimerFormValues["afterZeroMode"]
const AFTER_ZERO_OPTIONS: Array<{
  value: AfterZeroMode
  labelKey: MessageKey
}> = [
  { value: "use-default", labelKey: "timer.form.afterZero.useDefault" },
  {
    value: "move-directly-to-past",
    labelKey: "timer.form.afterZero.moveDirectly",
  },
  { value: "keep-visible-5m", labelKey: "timer.form.afterZero.keep5m" },
  { value: "keep-visible-15m", labelKey: "timer.form.afterZero.keep15m" },
  { value: "keep-visible-1h", labelKey: "timer.form.afterZero.keep1h" },
  { value: "keep-visible-1d", labelKey: "timer.form.afterZero.keep1d" },
  { value: "keep-visible-custom", labelKey: "timer.form.afterZero.keepCustom" },
  { value: "until-reviewed", labelKey: "timer.form.afterZero.untilReviewed" },
]

export function afterZeroHintKey(mode: AfterZeroMode): MessageKey {
  if (mode === "use-default") return "timer.form.afterZero.hint.useDefault"
  if (mode === "move-directly-to-past") return "timer.form.afterZero.hint.moveDirectly"
  if (mode === "until-reviewed") return "timer.form.afterZero.hint.untilReviewed"
  return "timer.form.afterZero.hint.keepFor"
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
  props: Readonly<{
    rule: Extract<MilestoneRule, { at: number[] }>
    onChange: (at: number[]) => void
  }>,
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
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors duration-press ease-fade",
            props.active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
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

export function TimerMilestonesField(
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
            <div className="flex flex-wrap gap-1.5">
              {MILESTONE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(CHIP_CLASS, chipStateClass(false))}
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
                        next[index] = {
                          ...rule,
                          every: Number(event.target.value),
                        }
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
                    <SelectContent className={MENU_MOTION_CLASSNAME}>
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2.5 justify-self-start text-primary"
                onClick={() => field.onChange([...rules, { unit: "years", every: 1 }])}
              >
                <PlusIcon aria-hidden="true" className="size-3.5" />
                {formatMessage("timer.form.milestones.addRule")}
              </Button>
            ) : null}
            {fieldState.error ? (
              <FadeInText className="text-xs text-destructive">{fieldState.error.message}</FadeInText>
            ) : null}
            <SchedulePreview dates={props.preview} timezone={props.timezone} />
          </div>
        )
      }}
    />
  )
}

function SpaceChips(props: Readonly<{ control: Control<TimerFormValues>; spaces: Space[] }>) {
  return (
    <Controller
      control={props.control}
      name="spaceId"
      render={({ field }) => (
        <div className="grid gap-2">
          <Label>{formatMessage("timer.form.space")}</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={!field.value}
              className={cn(CHIP_CLASS, chipStateClass(!field.value))}
              onClick={() => field.onChange("")}
            >
              {formatMessage("timer.form.noneSpace")}
            </button>
            {props.spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                aria-pressed={field.value === space.id}
                className={cn(CHIP_CLASS, "max-w-full gap-1.5", chipStateClass(field.value === space.id))}
                onClick={() => field.onChange(space.id)}
              >
                <span
                  className="size-2 shrink-0 rounded-full bg-muted-foreground"
                  style={space.color ? { backgroundColor: space.color } : undefined}
                />
                <span className="truncate">{space.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    />
  )
}

/**
 * Name, asked once, with description, link and space behind one disclosure.
 */
export function TimerNameSection(
  props: Readonly<{
    control: Control<TimerFormValues>
    register: UseFormRegister<TimerFormValues>
    spaces: Space[]
    labelLength: number
    descriptionLength: number
    labelPlaceholder: string
    autoFocus?: boolean
    detailsInitiallyOpen?: boolean
  }>,
) {
  const { control, register } = props
  const detailsId = useId()
  const [detailsOpen, setDetailsOpen] = useState(props.detailsInitiallyOpen === true)

  return (
    <div>
      <div className="grid gap-2">
        <Label htmlFor="label">{formatMessage("timer.form.label")}</Label>
        <Input
          id="label"
          maxLength={60}
          placeholder={props.labelPlaceholder}
          autoFocus={props.autoFocus}
          {...register("label")}
        />
        {props.labelLength >= 50 ? (
          <FadeInText className="text-xs text-muted-foreground">{props.labelLength}/60</FadeInText>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="-ml-1.5 justify-self-start text-muted-foreground"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <PlusIcon
            aria-hidden="true"
            className={cn(
              "transition-transform duration-enter ease-move motion-reduce:transition-none",
              detailsOpen && "rotate-45",
            )}
          />
          {formatMessage("timer.form.moreDetails")}
        </Button>
      </div>
      <Collapsible open={detailsOpen} id={detailsId} className="grid gap-4 pt-3">
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
                aria-invalid={fieldState.error ? true : undefined}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
              {fieldState.error ? (
                <FadeInText className="text-xs text-destructive">{fieldState.error.message}</FadeInText>
              ) : null}
            </div>
          )}
        />

        {props.spaces.length > 0 ? <SpaceChips control={control} spaces={props.spaces} /> : null}
      </Collapsible>
    </div>
  )
}

/**
 * The direction switch with one plain sentence for the chosen mode. After
 * creation the direction is shown read-only.
 */
export function TimerDirectionSection(
  props: Readonly<{
    timerMode: TimerFormValues["timerMode"]
    onTimerModeChange: (mode: TimerFormValues["timerMode"]) => void
    locked?: boolean
    lockedAction?: ReactNode
    hintAction?: ReactNode
  }>,
) {
  if (props.locked) {
    return (
      <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>
            {formatMessage(props.timerMode === "since" ? "timer.form.mode.lockedSince" : "timer.form.mode.lockedUntil")}
          </span>
          <LockIcon className="size-3.5 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-xs text-muted-foreground">{formatMessage("timer.form.mode.lockedDescription")}</p>
        {props.lockedAction}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <div
        role="group"
        aria-label={formatMessage("timer.form.mode.label")}
        className="grid grid-cols-2 gap-1 rounded-full border border-border p-1"
      >
        {(["until", "since"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={props.timerMode === mode}
            className={cn(
              "min-h-8 rounded-full px-3 text-xs font-medium outline-none transition-[color,background-color,transform] duration-press ease-fade focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
              props.timerMode === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => props.onTimerModeChange(mode)}
          >
            {formatMessage(`timer.form.mode.${mode}` as MessageKey)}
          </button>
        ))}
      </div>
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <FadeInText key={props.timerMode} className="text-xs text-muted-foreground">
          {formatMessage(props.timerMode === "since" ? "timer.form.mode.sinceHint" : "timer.form.mode.untilHint")}
        </FadeInText>
        {props.hintAction}
      </div>
    </div>
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

// A countdown being created can run for a duration instead of to a date. The
// switch is a quiet text action so it does not compete with the direction.
export function ScheduleModeSwitch(props: Readonly<{ control: Control<TimerFormValues> }>) {
  const { field } = useController({
    control: props.control,
    name: "scheduleMode",
  })
  const target = field.value === "in" ? "at" : "in"
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="-my-1 -ml-1.5 text-muted-foreground sm:mr-[-0.375rem] sm:ml-0"
      onClick={() => field.onChange(target)}
    >
      {target === "in" ? <TimerIcon aria-hidden="true" /> : <CalendarIcon aria-hidden="true" />}
      {formatMessage(target === "in" ? "timer.form.schedule.useDuration" : "timer.form.schedule.useDate")}
    </Button>
  )
}

/**
 * Date, time and zone in one row with quick picks and the live sentence under
 * it. Countdowns being created can switch to a duration instead.
 */
export function TimerWhenSection(
  props: Readonly<{
    control: Control<TimerFormValues>
    allowScheduleMode?: boolean
    localTz: string
    scheduleMode: TimerFormValues["scheduleMode"]
    timerMode: TimerFormValues["timerMode"]
    directionSuggestion?: "since" | "until"
    focusDateOnMount?: boolean
    livePreview?: string
    onTimerModeChange: (mode: TimerFormValues["timerMode"]) => void
  }>,
) {
  const { control } = props
  const sinceMode = props.timerMode === "since"
  const durationMode = props.allowScheduleMode === true && props.scheduleMode === "in" && !sinceMode
  const directionSuggestion = props.directionSuggestion

  return (
    <div className="grid gap-2">
      {durationMode ? (
        <RevealRow>
          <TimerDurationField control={control} />
        </RevealRow>
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.3fr)]">
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
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <div className="col-span-2 grid min-w-0 gap-2 sm:col-span-1">
                  <Label>{formatMessage("timer.form.timezone")}</Label>
                  <TimezoneSelect value={field.value} onChange={field.onChange} localTz={props.localTz} />
                </div>
              )}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <Controller
              control={control}
              name="date"
              render={({ field }) => (
                <DatePresetChips
                  className="gap-1.5"
                  direction={sinceMode ? "past" : "future"}
                  onChange={field.onChange}
                />
              )}
            />
            {props.livePreview ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {props.livePreview}
              </p>
            ) : null}
          </div>

          {directionSuggestion ? (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-amber-950 opacity-100 transition-opacity duration-enter ease-fade starting:opacity-0 dark:bg-amber-950/30 dark:text-amber-100"
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
        </>
      )}
    </div>
  )
}

/**
 * Alarm on this device and reminders as two rows of one block. Signed-out
 * people see the reminders switched off with a sign-in action in the block.
 */
export function TimerAlertsSection(
  props: Readonly<{
    control: Control<TimerFormValues>
    timerMode: TimerFormValues["timerMode"]
    isPastDate: boolean
    signedIn: boolean
    signInAction?: ReactNode
    onNotifyChange: (checked: boolean) => void
  }>,
) {
  const sinceMode = props.timerMode === "since"
  const reminderTitleId = useId()

  return (
    <div className="grid rounded-xl border">
      {!sinceMode ? (
        <Controller
          control={props.control}
          name="notify"
          render={({ field }) => (
            <div className="grid gap-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                  <Label htmlFor="notify">{formatMessage("timer.form.alarm.title")}</Label>
                  <p className="text-xs text-muted-foreground">{formatMessage("timer.form.alarm.description")}</p>
                </div>
                <Switch
                  id="notify"
                  checked={field.value}
                  onCheckedChange={(checked) => props.onNotifyChange(checked)}
                />
              </div>
              {field.value && props.isPastDate ? (
                <FadeInText
                  role="status"
                  className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  {formatMessage("notifications.futureOnly.inline")}
                </FadeInText>
              ) : null}
            </div>
          )}
        />
      ) : null}

      <div role="group" aria-labelledby={reminderTitleId} className={cn("grid gap-2 p-3", !sinceMode && "border-t")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span id={reminderTitleId} className="text-sm font-medium">
            {formatMessage("timer.form.reminders.remindMe")}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatMessage(sinceMode ? "timer.form.reminders.sinceHint" : "timer.form.reminders.untilHint", {
              max: MAX_TIMER_REMINDERS,
            })}
          </span>
        </div>
        <TimerReminderChips control={props.control} timerMode={props.timerMode} disabled={!props.signedIn} />
      </div>

      {props.signedIn ? null : (
        <div
          data-reminders-signed-out
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-b-xl border-t bg-muted px-3 py-2.5"
        >
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {formatMessage("timer.form.reminders.signedOut")}
          </p>
          {props.signInAction}
        </div>
      )}
    </div>
  )
}

function TimerAfterZeroField(props: Readonly<{ control: Control<TimerFormValues> }>) {
  const { field } = useController({
    control: props.control,
    name: "afterZeroMode",
  })
  const mode = field.value

  return (
    <>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="timer-after-zero">{formatMessage("timer.form.afterZero.label")}</Label>
        <Select value={mode} onValueChange={(value) => field.onChange(value as AfterZeroMode)}>
          <SelectTrigger id="timer-after-zero" aria-label={formatMessage("timer.form.afterZero.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={MENU_MOTION_CLASSNAME}>
            {AFTER_ZERO_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {formatMessage(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* The hint follows the choice; the custom duration opens and closes in place. One
          box spans the row so a closed field leaves no gap behind. */}
      <div className="col-span-full grid">
        <SmoothHeight>
          <FadeInText key={afterZeroHintKey(mode)} className="text-xs text-muted-foreground">
            {formatMessage(afterZeroHintKey(mode))}
          </FadeInText>
        </SmoothHeight>
        <PresenceRow open={mode === "keep-visible-custom"} className="grid gap-2 pt-2">
          <Label htmlFor="timer-after-zero-minutes">{formatMessage("timer.form.afterZero.customMinutes")}</Label>
          <Controller
            control={props.control}
            name="afterZeroMinutes"
            render={({ field: minutesField, fieldState }) => (
              <>
                <Input
                  id="timer-after-zero-minutes"
                  type="number"
                  min={1}
                  max={525_600}
                  inputMode="numeric"
                  aria-invalid={fieldState.error ? true : undefined}
                  name={minutesField.name}
                  ref={minutesField.ref}
                  value={minutesField.value}
                  onBlur={minutesField.onBlur}
                  onChange={minutesField.onChange}
                />
                {fieldState.error ? (
                  <FadeInText className="text-xs text-destructive">{fieldState.error.message}</FadeInText>
                ) : null}
              </>
            )}
          />
        </PresenceRow>
      </div>
    </>
  )
}

/**
 * Repeat as a list, and what happens when a one-off countdown ends.
 */
export function TimerRepeatSection(
  props: Readonly<{
    control: Control<TimerFormValues>
    repeatPreview: string[]
    timezone: string
    showRepeat: boolean
  }>,
) {
  const repeatEnabled = useController({
    control: props.control,
    name: "repeatEnabled",
  })
  const repeatType = useController({
    control: props.control,
    name: "repeatType",
  })
  const enabled = repeatEnabled.field.value
  const value = enabled ? repeatType.field.value : NO_REPEAT

  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
      {props.showRepeat ? (
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="timer-repeat">{formatMessage("timer.form.repeat")}</Label>
          <Select
            value={value}
            onValueChange={(next) => {
              if (next === NO_REPEAT) {
                repeatEnabled.field.onChange(false)
                return
              }
              repeatType.field.onChange(next as TimerFormRecurrenceType)
              repeatEnabled.field.onChange(true)
            }}
          >
            <SelectTrigger id="timer-repeat" aria-label={formatMessage("timer.form.repeat")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={MENU_MOTION_CLASSNAME}>
              <SelectItem value={NO_REPEAT}>{formatMessage("timer.form.repeat.none")}</SelectItem>
              {RECURRENCE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {formatMessage(RECURRENCE_TYPE_LABEL_KEYS[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {enabled && props.showRepeat ? (
        <RevealRow outerClassName="sm:col-span-2" className="grid gap-2">
          <p className="text-xs text-muted-foreground">{formatMessage("timer.form.repeat.hint")}</p>
          {repeatType.field.value === "monthly" ? (
            <Controller
              control={props.control}
              name="lastDay"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    className="size-3.5 rounded border accent-primary"
                  />
                  <span>{formatMessage("timer.form.lastDayOfMonth")}</span>
                </label>
              )}
            />
          ) : null}
          <SchedulePreview dates={props.repeatPreview} timezone={props.timezone} />
        </RevealRow>
      ) : null}
      {enabled ? null : <TimerAfterZeroField control={props.control} />}
    </div>
  )
}

export function TimerPhotoSection(props: Readonly<{ control: Control<TimerFormValues> }>) {
  return (
    <Controller
      control={props.control}
      name="image"
      render={({ field }) => <UnsplashPicker value={field.value} onChange={field.onChange} />}
    />
  )
}
