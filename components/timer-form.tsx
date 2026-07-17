import { zodResolver } from "@hookform/resolvers/zod"
import { formatInTimeZone } from "date-fns-tz"
import { ChevronDownIcon } from "lucide-react"
import { useId, useMemo, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import {
  TimerBasicsSection,
  TimerCustomizeSection,
  TimerFormSectionHeading,
  TimerFormStepper,
  TimerScheduleSection,
} from "@/components/timer-form-sections"
import { StartCountUpFromDate } from "@/components/start-count-up-from-date"
import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { authClient } from "@/lib/auth/auth-client"
import { useBrowserTimeZone, useDefaultTimeZone } from "@/lib/default-timezone.client"
import { formatMessage, formatPluralMessage, nextDefaultTimerLabel, type MessageKey } from "@/lib/i18n/messages"
import { formatMilestoneDisplayLabel } from "@/lib/milestone-display"
import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import { upcomingMilestones } from "@/lib/milestones"
import {
  SINCE_TIMER_RECIPE_IDS,
  durationTotalSeconds,
  isTimerFormStepValid,
  normalizeTimerUrl,
  timerFormSchema,
  timerFormStepFields,
  timerAfterZeroFromForm,
  timerTemplateFormSeed,
  type TimerCreationTemplateId,
  type TimerFormStep,
  type TimerFormSubmitValue,
  type TimerFormValues,
} from "@/lib/schemas/timer"
import { useTimerStore } from "@/lib/store"
import { timerAlertReadiness } from "@/lib/timer-alert-readiness.client"
import type { Timer } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import {
  effectiveTargetDate,
  nextSlotOccurrence,
  recurrenceSlot,
  upcomingOccurrences,
  wallClockToUtcIso,
} from "@/lib/utils"

type Mode = "create" | "edit"

export type { TimerFormSubmitValue } from "@/lib/schemas/timer"

type TimerFormProps = {
  mode: Mode
  initial?: Timer
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSubmit: (timer: TimerFormSubmitValue) => void
}

const TIMER_TEMPLATE_LABEL_KEYS: Record<TimerCreationTemplateId, MessageKey> = {
  blank: "timer.form.template.blank",
  birthday: "timer.form.template.birthday",
  deadline: "timer.form.template.deadline",
  anniversary: "timer.form.template.anniversary",
  monthiversary: "timer.form.template.monthiversary",
  "recovery-ladder": "timer.form.template.recoveryLadder",
  streak: "timer.form.template.streak",
}

function nextStep(step: TimerFormStep): TimerFormStep {
  return step < 3 ? ((step + 1) as TimerFormStep) : step
}

function previousStep(step: TimerFormStep): TimerFormStep {
  return step > 1 ? ((step - 1) as TimerFormStep) : step
}

function recurrenceForSubmit(parsed: TimerFormValues) {
  if (!parsed.repeatEnabled) return undefined

  const monthlyLastDay = parsed.repeatType === "monthly" && parsed.lastDay
  return {
    type: parsed.repeatType,
    enabled: true,
    ...(monthlyLastDay ? { lastDay: true } : {}),
  }
}

function afterZeroFormDefaults(
  afterZero: Timer["afterZero"],
): Pick<TimerFormValues, "afterZeroMode" | "afterZeroMinutes"> {
  if (!afterZero || afterZero.mode === "use-default") return { afterZeroMode: "use-default", afterZeroMinutes: "30" }
  if (afterZero.mode === "move-directly-to-past") {
    return { afterZeroMode: "move-directly-to-past", afterZeroMinutes: "30" }
  }
  if (afterZero.mode === "until-reviewed") return { afterZeroMode: "until-reviewed", afterZeroMinutes: "30" }
  const fixedMode = {
    5: "keep-visible-5m",
    15: "keep-visible-15m",
    60: "keep-visible-1h",
    1440: "keep-visible-1d",
  }[afterZero.minutes] as TimerFormValues["afterZeroMode"] | undefined
  return {
    afterZeroMode: fixedMode ?? "keep-visible-custom",
    afterZeroMinutes: String(afterZero.minutes),
  }
}

function getDefaultValues(args: {
  initial?: Timer
  mode: Mode
  activeSpaceId: string | null
  localTz: string
  nowMs: number
  templateId: TimerCreationTemplateId
}): TimerFormValues {
  const timezone = args.initial?.timezone ?? args.localTz
  const targetDate =
    args.initial && args.initial.recurrence?.enabled === true
      ? effectiveTargetDate(args.initial, args.nowMs)
      : args.initial?.targetDate
  const activeSpaceId =
    args.mode === "create" && args.activeSpaceId && args.activeSpaceId !== UNASSIGNED_SPACE_ID ? args.activeSpaceId : ""
  const template = timerTemplateFormSeed(args.templateId)
  const timerMode = args.initial?.mode ?? template.timerMode

  return {
    label: args.initial?.label ?? "",
    description: args.initial?.description ?? "",
    url: args.initial?.url ?? "",
    timezone,
    scheduleMode: "at",
    date: targetDate ? formatInTimeZone(targetDate, timezone, "yyyy-MM-dd") : "",
    time: targetDate ? formatInTimeZone(targetDate, timezone, "HH:mm") : "09:00",
    durationDays: "00",
    durationHours: "00",
    durationMinutes: "10",
    durationSeconds: "00",
    notify:
      timerMode === "since"
        ? false
        : args.initial
          ? timerNotificationsEnabled(args.initial.notification, args.initial.notify)
          : true,
    timerMode,
    milestoneRules: args.initial?.milestones?.rules ?? template.milestoneRules,
    reminders:
      args.initial?.reminders?.map((reminder) => ({
        offsetMinutes: reminder.offsetMinutes,
      })) ?? template.reminders,
    repeatEnabled: args.initial?.recurrence?.enabled ?? template.repeatEnabled,
    repeatType: args.initial?.recurrence?.type ?? template.repeatType,
    lastDay: args.initial?.recurrence?.lastDay ?? false,
    spaceId: args.initial?.spaceId ?? activeSpaceId,
    image: args.initial?.image ?? null,
    ...afterZeroFormDefaults(args.initial?.afterZero),
  }
}

function TimerAfterZeroField(props: Readonly<{ form: UseFormReturn<TimerFormValues> }>) {
  const mode = useWatch({ control: props.form.control, name: "afterZeroMode" })

  return (
    <div className="grid gap-2">
      <Label htmlFor="timer-after-zero">{formatMessage("timer.form.afterZero.label")}</Label>
      <Select
        value={mode}
        onValueChange={(value) =>
          props.form.setValue("afterZeroMode", value as TimerFormValues["afterZeroMode"], {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          })
        }
      >
        <SelectTrigger id="timer-after-zero" aria-label={formatMessage("timer.form.afterZero.label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="use-default">{formatMessage("timer.form.afterZero.useDefault")}</SelectItem>
          <SelectItem value="move-directly-to-past">{formatMessage("timer.form.afterZero.moveDirectly")}</SelectItem>
          <SelectItem value="keep-visible-5m">{formatMessage("timer.form.afterZero.keep5m")}</SelectItem>
          <SelectItem value="keep-visible-15m">{formatMessage("timer.form.afterZero.keep15m")}</SelectItem>
          <SelectItem value="keep-visible-1h">{formatMessage("timer.form.afterZero.keep1h")}</SelectItem>
          <SelectItem value="keep-visible-1d">{formatMessage("timer.form.afterZero.keep1d")}</SelectItem>
          <SelectItem value="keep-visible-custom">{formatMessage("timer.form.afterZero.keepCustom")}</SelectItem>
          <SelectItem value="until-reviewed">{formatMessage("timer.form.afterZero.untilReviewed")}</SelectItem>
        </SelectContent>
      </Select>
      {mode === "keep-visible-custom" ? (
        <div className="grid gap-2">
          <Label htmlFor="timer-after-zero-minutes">{formatMessage("timer.form.afterZero.customMinutes")}</Label>
          <Input
            id="timer-after-zero-minutes"
            type="number"
            min={1}
            max={525_600}
            inputMode="numeric"
            {...props.form.register("afterZeroMinutes")}
          />
        </div>
      ) : null}
    </div>
  )
}

type NotifyToggleResult = {
  checked: boolean
  errorKey?: MessageKey
}

async function resolveNotifyToggle(checked: boolean, signedIn: boolean): Promise<NotifyToggleResult> {
  if (!checked) return { checked: false }

  const readiness = timerAlertReadiness({ signedIn })
  return readiness.ready ? { checked: true } : { checked: false, errorKey: readiness.messageKey }
}

function TimerStepContent(
  props: Readonly<{
    currentStep: TimerFormStep
    descriptionLength: number
    form: UseFormReturn<TimerFormValues>
    isPastDate: boolean
    directionSuggestion?: "since" | "until"
    focusDateOnMount?: boolean
    labelLength: number
    labelPlaceholder: string
    localTz: string
    onNotifyChange: (checked: boolean) => void
    repeatEnabled: boolean
    repeatPreview: string[]
    timerMode: TimerFormValues["timerMode"]
    milestonePreview: string[]
    livePreview?: string
    repeatType: TimerFormValues["repeatType"]
    scheduleMode: TimerFormValues["scheduleMode"]
    spaces: ComponentProps<typeof TimerBasicsSection>["spaces"]
    timezone: string
    onTimerModeChange: (mode: TimerFormValues["timerMode"]) => void
  }>,
) {
  if (props.currentStep === 1) {
    return (
      <TimerBasicsSection
        control={props.form.control}
        register={props.form.register}
        spaces={props.spaces}
        labelLength={props.labelLength}
        descriptionLength={props.descriptionLength}
        labelPlaceholder={props.labelPlaceholder}
      />
    )
  }

  if (props.currentStep === 2) {
    return (
      <>
        <TimerScheduleSection
          control={props.form.control}
          allowScheduleMode
          localTz={props.localTz}
          timezone={props.timezone}
          scheduleMode={props.scheduleMode}
          repeatEnabled={props.repeatEnabled}
          repeatType={props.repeatType}
          repeatPreview={props.repeatPreview}
          timerMode={props.timerMode}
          milestonePreview={props.milestonePreview}
          isPastDate={props.isPastDate}
          directionSuggestion={props.directionSuggestion}
          focusDateOnMount={props.focusDateOnMount}
          livePreview={props.livePreview}
          onNotifyChange={props.onNotifyChange}
          onTimerModeChange={props.onTimerModeChange}
        />
        {!props.repeatEnabled && props.timerMode !== "since" ? <TimerAfterZeroField form={props.form} /> : null}
      </>
    )
  }

  if (props.currentStep === 3) return <TimerCustomizeSection control={props.form.control} />
  return null
}

function TimerFormFooter(
  props: Readonly<{
    currentStep: TimerFormStep
    currentStepReady: boolean
    currentStepValid: boolean
    mode: Mode
    notifyBlockedByPastDate: boolean
    formId: string
    onBack: () => void
    onNext: (event: MouseEvent<HTMLButtonElement>) => void
    scheduleValid: boolean
  }>,
) {
  // Rendered inside DialogFooter at the DialogContent level: the dialog pins
  // only direct DialogFooter children, so the wrapper must not own it.
  return (
    <>
      {props.currentStep > 1 ? (
        <Button type="button" variant="outline" onClick={props.onBack}>
          {formatMessage("common.back")}
        </Button>
      ) : null}
      {props.currentStep < 3 ? (
        <Button type="button" disabled={!props.currentStepReady} onClick={props.onNext}>
          {formatMessage("common.next")}
        </Button>
      ) : (
        <Button
          form={props.formId}
          type="submit"
          disabled={!props.currentStepValid || !props.scheduleValid || props.notifyBlockedByPastDate}
        >
          {formatMessage(props.mode === "create" ? "common.create" : "common.save")}
        </Button>
      )}
    </>
  )
}

function TimerEditFooter(props: Readonly<{ formId: string; saveDisabled: boolean }>) {
  return (
    <Button form={props.formId} type="submit" disabled={props.saveDisabled}>
      {formatMessage("common.save")}
    </Button>
  )
}

// Edit reveals every section at once (basics, schedule, customize) so changing a
// single field never forces a walk through the create wizard's three steps.
function TimerEditSections(
  props: Readonly<{
    form: UseFormReturn<TimerFormValues>
    spaces: ComponentProps<typeof TimerBasicsSection>["spaces"]
    labelLength: number
    labelPlaceholder: string
    descriptionLength: number
    localTz: string
    timezone: string
    scheduleMode: TimerFormValues["scheduleMode"]
    repeatEnabled: boolean
    repeatType: TimerFormValues["repeatType"]
    repeatPreview: string[]
    timerMode: TimerFormValues["timerMode"]
    milestonePreview: string[]
    livePreview?: string
    isPastDate: boolean
    onNotifyChange: (checked: boolean) => void
    onTimerModeChange: (mode: TimerFormValues["timerMode"]) => void
    timer: Timer
    onStartCountUpComplete: () => void
  }>,
) {
  const [customizeOpen, setCustomizeOpen] = useState(false)

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-lg border p-4">
        <TimerFormSectionHeading step={1} labelKey="timer.form.basics" />
        <TimerBasicsSection
          control={props.form.control}
          register={props.form.register}
          spaces={props.spaces}
          labelLength={props.labelLength}
          descriptionLength={props.descriptionLength}
          labelPlaceholder={props.labelPlaceholder}
        />
      </section>
      <section className="grid gap-3 rounded-lg border p-4">
        <TimerFormSectionHeading step={2} labelKey="timer.form.schedule" />
        <TimerScheduleSection
          control={props.form.control}
          localTz={props.localTz}
          timezone={props.timezone}
          scheduleMode={props.scheduleMode}
          repeatEnabled={props.repeatEnabled}
          repeatType={props.repeatType}
          repeatPreview={props.repeatPreview}
          timerMode={props.timerMode}
          milestonePreview={props.milestonePreview}
          isPastDate={props.isPastDate}
          livePreview={props.livePreview}
          onNotifyChange={props.onNotifyChange}
          onTimerModeChange={props.onTimerModeChange}
          timerModeLocked
          lockedDirectionAction={<StartCountUpFromDate timer={props.timer} onComplete={props.onStartCountUpComplete} />}
        />
        {!props.repeatEnabled && props.timerMode !== "since" ? <TimerAfterZeroField form={props.form} /> : null}
      </section>
      <section className="grid gap-3 rounded-lg border p-4">
        <button
          type="button"
          className="flex items-center justify-between gap-3 text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          aria-expanded={customizeOpen}
          onClick={() => setCustomizeOpen((open) => !open)}
        >
          <TimerFormSectionHeading step={3} labelKey="timer.form.customize" />
          <ChevronDownIcon
            className={["size-4 text-muted-foreground transition-transform", customizeOpen ? "rotate-180" : ""].join(
              " ",
            )}
          />
        </button>
        {customizeOpen ? <TimerCustomizeSection control={props.form.control} /> : null}
      </section>
    </div>
  )
}

function TimerFormContent(
  props: Readonly<
    Omit<TimerFormProps, "onOpenChange" | "open" | "trigger"> & {
      onOpenChange: (open: boolean) => void
      templateId: TimerCreationTemplateId
      fromTemplateMenu: boolean
    }
  >,
) {
  const spaces = useTimerStore((s) => s.spaces ?? [])
  const timers = useTimerStore((s) => s.timers ?? [])
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId ?? null)
  const defaultTz = useDefaultTimeZone()
  const browserTz = useBrowserTimeZone()
  const nowMs = useNow()
  const [step, setStep] = useState<TimerFormStep>(() =>
    props.fromTemplateMenu && props.templateId !== "blank" ? 2 : 1,
  )
  const session = authClient.useSession()
  const formId = useId()

  const defaultValues = useMemo(
    () =>
      getDefaultValues({
        initial: props.initial,
        mode: props.mode,
        activeSpaceId,
        localTz: defaultTz,
        nowMs,
        templateId: props.templateId,
      }),
    [activeSpaceId, defaultTz, nowMs, props.initial, props.mode, props.templateId],
  )

  const form = useForm<TimerFormValues>({
    resolver: zodResolver(timerFormSchema),
    defaultValues,
    mode: "onChange",
  })

  const values = useWatch({ control: form.control }) as TimerFormValues
  const label = values.label ?? ""
  const description = values.description ?? ""
  const date = values.date ?? ""
  const time = values.time ?? ""
  const timezone = values.timezone ?? defaultTz
  const scheduleMode = values.scheduleMode ?? "at"
  const notify = values.notify ?? false
  const repeatEnabled = values.repeatEnabled ?? false
  const repeatType = values.repeatType ?? "yearly"
  const lastDay = values.lastDay ?? false
  const timerMode = values.timerMode ?? "until"
  const milestoneRules = values.milestoneRules

  const labelLength = label.trim().length
  const descriptionLength = description.trim().length
  const labelPlaceholder = useMemo(() => nextDefaultTimerLabel(timers), [timers])
  const currentStepValid = isTimerFormStepValid(step, values)
  const scheduleValid = isTimerFormStepValid(2, values)

  const selectedTargetMs = useMemo(() => {
    if (scheduleMode === "in") return null
    try {
      const targetMs = new Date(wallClockToUtcIso({ date, time, timezone })).getTime()
      return Number.isFinite(targetMs) ? targetMs : null
    } catch {
      return null
    }
  }, [date, scheduleMode, time, timezone])

  const isPastDate = selectedTargetMs !== null && selectedTargetMs < nowMs

  const isEdit = props.mode === "edit"
  const notifyBlockedByPastDate = timerMode !== "since" && notify && isPastDate
  const currentStepReady = currentStepValid && !(step === 2 && notifyBlockedByPastDate)
  const basicsValid = isTimerFormStepValid(1, values)
  const editSaveDisabled = !basicsValid || !scheduleValid || notifyBlockedByPastDate
  const directionSuggestion = useMemo(() => {
    if (isEdit || scheduleMode !== "at" || typeof selectedTargetMs !== "number") return undefined
    if (timerMode === "until" && selectedTargetMs < nowMs) return "since" as const
    if (timerMode === "since" && selectedTargetMs > nowMs + 60_000) return "until" as const
    return undefined
  }, [isEdit, nowMs, scheduleMode, selectedTargetMs, timerMode])

  const firstOccurrence = useMemo(() => {
    if (scheduleMode === "in") return null
    if (!repeatEnabled || !scheduleValid) return null
    const anchor = wallClockToUtcIso({ date, time, timezone })
    const slot = recurrenceSlot(anchor, repeatType, timezone, lastDay)
    return nextSlotOccurrence(slot, timezone, nowMs - 1) ?? anchor
  }, [date, lastDay, nowMs, repeatEnabled, repeatType, scheduleMode, scheduleValid, time, timezone])

  const repeatPreview = useMemo(() => {
    if (!firstOccurrence) return []
    return upcomingOccurrences(firstOccurrence, repeatType, timezone, 3, lastDay)
  }, [firstOccurrence, lastDay, repeatType, timezone])

  const milestoneOccurrences = useMemo(() => {
    const rules = milestoneRules ?? []
    if (timerMode !== "since" || scheduleMode !== "at" || !scheduleValid || rules.length === 0) return []
    const anchor = wallClockToUtcIso({ date, time, timezone })
    return upcomingMilestones(anchor, rules, timezone, nowMs, 3)
  }, [date, milestoneRules, nowMs, scheduleMode, scheduleValid, time, timerMode, timezone])
  const milestonePreview = useMemo(
    () => milestoneOccurrences.map((occurrence) => occurrence.at),
    [milestoneOccurrences],
  )

  const livePreview = useMemo(() => {
    if (scheduleMode !== "at" || typeof selectedTargetMs !== "number") return undefined
    if (timerMode === "until") {
      if (selectedTargetMs < nowMs) return undefined
      const days = Math.ceil((selectedTargetMs - nowMs) / 86_400_000)
      return formatMessage("timer.form.preview.until", {
        count: days,
        unit: formatPluralMessage("milestone.unit.days", days),
      })
    }
    if (selectedTargetMs > nowMs + 60_000) return undefined
    const elapsedDays = Math.max(0, Math.floor((nowMs - selectedTargetMs) / 86_400_000))
    const elapsed = formatMessage("timer.form.preview.elapsed", {
      count: elapsedDays,
      unit: formatPluralMessage("milestone.unit.days", elapsedDays),
    })
    const nextMilestone = milestoneOccurrences[0]
    if (nextMilestone) return `${elapsed} · ${formatMilestoneDisplayLabel("next", nextMilestone, timezone)}`
    const rules = milestoneRules ?? []
    if (rules.length > 0 && rules.every((rule) => "at" in rule)) {
      return `${elapsed} · ${formatMessage("timer.display.ladderComplete")}`
    }
    return elapsed
  }, [milestoneOccurrences, milestoneRules, nowMs, scheduleMode, selectedTargetMs, timerMode, timezone])

  function handleTimerModeChange(mode: TimerFormValues["timerMode"]) {
    if (props.mode === "edit") return
    form.setValue("timerMode", mode, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
    if (mode === "since") {
      form.setValue("scheduleMode", "at", { shouldDirty: true })
      form.setValue("repeatEnabled", false, { shouldDirty: true })
      form.setValue("notify", false, { shouldDirty: true })
      if (form.getValues("milestoneRules").length === 0) {
        form.setValue("milestoneRules", [{ unit: "years", every: 1 }], {
          shouldDirty: true,
        })
      }
      const reminders = form.getValues("reminders")
      if (!reminders.some((reminder) => reminder.offsetMinutes === 0) && reminders.length < 5) {
        form.setValue("reminders", [...reminders, { offsetMinutes: 0 }], {
          shouldDirty: true,
        })
      }
    } else {
      form.setValue("milestoneRules", [], { shouldDirty: true })
    }
    void form.trigger(timerFormStepFields[2])
  }

  async function handleNotifyChange(checked: boolean) {
    const result = await resolveNotifyToggle(checked, Boolean(session.data?.user))
    if (result.errorKey) toast.error(formatMessage(result.errorKey))
    form.setValue("notify", result.checked, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  async function handleNextStep(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    const valid = await form.trigger(timerFormStepFields[step], {
      shouldFocus: true,
    })
    if (!valid) return
    if (step === 2 && notifyBlockedByPastDate) {
      toast.error(formatMessage("notifications.futureOnly"))
      return
    }
    setStep(nextStep(step))
  }

  function handleSubmit(values: TimerFormValues) {
    const parsed = timerFormSchema.parse(values)
    if (parsed.timerMode !== "since" && parsed.notify && isPastDate) {
      setStep(2)
      toast.error(formatMessage("notifications.futureOnly"))
      return
    }

    const durationMode = parsed.scheduleMode === "in"
    const picked = durationMode
      ? new Date(nowMs + durationTotalSeconds(parsed) * 1000).toISOString()
      : wallClockToUtcIso({
          date: parsed.date,
          time: parsed.time,
          timezone: parsed.timezone,
        })
    const targetDate = !durationMode && parsed.repeatEnabled ? (firstOccurrence ?? picked) : picked
    const submitTimezone = durationMode ? browserTz : parsed.timezone

    props.onSubmit({
      label: parsed.label || labelPlaceholder,
      description: parsed.description || undefined,
      url: parsed.url ? (normalizeTimerUrl(parsed.url) ?? undefined) : undefined,
      targetDate,
      timezone: submitTimezone,
      notify: parsed.notify,
      reminders: parsed.reminders.length > 0 ? parsed.reminders : undefined,
      recurrence: durationMode || parsed.timerMode === "since" ? undefined : recurrenceForSubmit(parsed),
      spaceId: parsed.spaceId || undefined,
      image: parsed.image ?? undefined,
      afterZero: parsed.repeatEnabled || parsed.timerMode === "since" ? undefined : timerAfterZeroFromForm(parsed),
      mode: parsed.timerMode,
      milestones: parsed.timerMode === "since" ? { rules: parsed.milestoneRules } : undefined,
    })
    props.onOpenChange(false)
  }

  return (
    <DialogContent
      sheetOnMobile
      onOpenAutoFocus={(event) => {
        if (!props.fromTemplateMenu || props.templateId === "blank") return
        event.preventDefault()
        const field = document.querySelector<HTMLElement>("[role='dialog'] [data-timer-date-field]")
        const desktop = globalThis.matchMedia?.("(min-width: 768px)").matches ?? false
        const target = field?.querySelector<HTMLElement>(desktop ? "button" : "input")
        target?.focus()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {formatMessage(props.mode === "create" ? "timer.form.createTitle" : "timer.form.editTitle")}
        </DialogTitle>
        <DialogDescription className="sr-only">{formatMessage("timer.form.dialogDescription")}</DialogDescription>
      </DialogHeader>

      <form id={formId} onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
        {isEdit ? (
          <TimerEditSections
            form={form}
            spaces={spaces}
            labelLength={labelLength}
            labelPlaceholder={labelPlaceholder}
            descriptionLength={descriptionLength}
            localTz={browserTz}
            timezone={timezone}
            scheduleMode={scheduleMode}
            repeatEnabled={repeatEnabled}
            repeatType={repeatType}
            repeatPreview={repeatPreview}
            timerMode={timerMode}
            milestonePreview={milestonePreview}
            livePreview={livePreview}
            isPastDate={isPastDate}
            onNotifyChange={(checked) => void handleNotifyChange(checked)}
            onTimerModeChange={handleTimerModeChange}
            timer={props.initial!}
            onStartCountUpComplete={() => props.onOpenChange(false)}
          />
        ) : (
          <>
            <TimerFormStepper step={step} />

            <div className="grid min-h-[280px] content-start gap-4">
              {step === 2 && props.fromTemplateMenu ? (
                <div className="grid gap-1.5 rounded-lg border bg-muted/30 px-3 py-2">
                  <Label htmlFor={`${formId}-template-label`} className="text-xs text-muted-foreground">
                    {formatMessage("timer.form.label")}
                  </Label>
                  <Input
                    id={`${formId}-template-label`}
                    maxLength={60}
                    placeholder={labelPlaceholder}
                    className="h-8 min-h-8 bg-background text-sm"
                    {...form.register("label")}
                  />
                </div>
              ) : null}
              <TimerStepContent
                currentStep={step}
                descriptionLength={descriptionLength}
                form={form}
                isPastDate={isPastDate}
                directionSuggestion={directionSuggestion}
                focusDateOnMount={props.fromTemplateMenu && props.templateId !== "blank"}
                labelLength={labelLength}
                labelPlaceholder={labelPlaceholder}
                localTz={browserTz}
                repeatEnabled={repeatEnabled}
                repeatPreview={repeatPreview}
                timerMode={timerMode}
                milestonePreview={milestonePreview}
                livePreview={livePreview}
                repeatType={repeatType}
                scheduleMode={scheduleMode}
                spaces={spaces}
                timezone={timezone}
                onNotifyChange={(checked) => void handleNotifyChange(checked)}
                onTimerModeChange={handleTimerModeChange}
              />
            </div>
          </>
        )}
      </form>
      {isEdit ? (
        <DialogFooter className="flex-row justify-end gap-2">
          <TimerEditFooter formId={formId} saveDisabled={editSaveDisabled} />
        </DialogFooter>
      ) : (
        <DialogFooter className="flex-row gap-2">
          <TimerFormFooter
            currentStep={step}
            currentStepReady={currentStepReady}
            currentStepValid={currentStepValid}
            formId={formId}
            mode={props.mode}
            notifyBlockedByPastDate={notifyBlockedByPastDate}
            scheduleValid={scheduleValid}
            onBack={() => setStep(previousStep(step))}
            onNext={(event) => void handleNextStep(event)}
          />
        </DialogFooter>
      )}
    </DialogContent>
  )
}

export function TimerForm(props: Readonly<TimerFormProps>) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [templateId, setTemplateId] = useState<TimerCreationTemplateId>("blank")
  const open = props.open ?? internalOpen
  const setOpen = props.onOpenChange ?? setInternalOpen
  const contentKey = `${props.mode}-${props.initial?.id ?? "new"}-${props.initial?.updatedAt ?? "current"}-${templateId}`

  const content = open ? (
    <TimerFormContent
      key={contentKey}
      mode={props.mode}
      initial={props.initial}
      templateId={templateId}
      fromTemplateMenu={props.open === undefined && props.mode === "create"}
      onOpenChange={setOpen}
      onSubmit={props.onSubmit}
    />
  ) : null

  if (props.open === undefined && props.mode === "create") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {props.trigger ?? <Button>{formatMessage("timer.form.newTimerButton")}</Button>}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DropdownMenuLabel>{formatMessage("timer.form.template.start")}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setTemplateId("blank")
                setOpen(true)
              }}
            >
              {formatMessage(TIMER_TEMPLATE_LABEL_KEYS.blank)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{formatMessage("timer.form.template.countdownGroup")}</DropdownMenuLabel>
            {(["birthday", "deadline"] as const).map((id) => (
              <DropdownMenuItem
                key={id}
                onSelect={() => {
                  setTemplateId(id)
                  setOpen(true)
                }}
              >
                {formatMessage(TIMER_TEMPLATE_LABEL_KEYS[id])}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{formatMessage("timer.form.template.sinceGroup")}</DropdownMenuLabel>
            {SINCE_TIMER_RECIPE_IDS.map((id) => (
              <DropdownMenuItem
                key={id}
                onSelect={() => {
                  setTemplateId(id)
                  setOpen(true)
                }}
              >
                {formatMessage(TIMER_TEMPLATE_LABEL_KEYS[id])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={open} onOpenChange={setOpen}>
          {content}
        </Dialog>
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.open === undefined ? (
        <DialogTrigger asChild>
          {props.trigger ?? <Button>{formatMessage("timer.form.newTimerButton")}</Button>}
        </DialogTrigger>
      ) : null}
      {content}
    </Dialog>
  )
}
