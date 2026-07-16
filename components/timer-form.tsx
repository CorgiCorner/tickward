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
import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
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
import { formatMessage, nextDefaultTimerLabel, type MessageKey } from "@/lib/i18n/messages"
import { timerNotificationsEnabled } from "@/lib/notification-preferences"
import {
  durationTotalSeconds,
  isTimerFormStepValid,
  normalizeTimerUrl,
  timerFormSchema,
  timerFormStepFields,
  timerAfterZeroFromForm,
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

function nextStep(step: TimerFormStep): TimerFormStep {
  return step < 3 ? ((step + 1) as TimerFormStep) : step
}

function previousStep(step: TimerFormStep): TimerFormStep {
  return step > 1 ? ((step - 1) as TimerFormStep) : step
}

function recurrenceForSubmit(parsed: TimerFormValues) {
  if (!parsed.repeatEnabled) return undefined

  const monthlyLastDay = parsed.repeatType === "monthly" && parsed.lastDay
  return { type: parsed.repeatType, enabled: true, ...(monthlyLastDay ? { lastDay: true } : {}) }
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
}): TimerFormValues {
  const timezone = args.initial?.timezone ?? args.localTz
  const targetDate =
    args.initial && args.initial.recurrence?.enabled === true
      ? effectiveTargetDate(args.initial, args.nowMs)
      : args.initial?.targetDate
  const activeSpaceId =
    args.mode === "create" && args.activeSpaceId && args.activeSpaceId !== UNASSIGNED_SPACE_ID ? args.activeSpaceId : ""

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
    notify: args.initial ? timerNotificationsEnabled(args.initial.notification, args.initial.notify) : true,
    reminders: args.initial?.reminders?.map((reminder) => ({ offsetMinutes: reminder.offsetMinutes })) ?? [],
    repeatEnabled: args.initial?.recurrence?.enabled ?? false,
    repeatType: args.initial?.recurrence?.type ?? "yearly",
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
    labelLength: number
    labelPlaceholder: string
    localTz: string
    onNotifyChange: (checked: boolean) => void
    repeatEnabled: boolean
    repeatPreview: string[]
    repeatType: TimerFormValues["repeatType"]
    scheduleMode: TimerFormValues["scheduleMode"]
    spaces: ComponentProps<typeof TimerBasicsSection>["spaces"]
    timezone: string
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
          isPastDate={props.isPastDate}
          onNotifyChange={props.onNotifyChange}
        />
        {!props.repeatEnabled ? <TimerAfterZeroField form={props.form} /> : null}
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
    isPastDate: boolean
    onNotifyChange: (checked: boolean) => void
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
          isPastDate={props.isPastDate}
          onNotifyChange={props.onNotifyChange}
        />
        {!props.repeatEnabled ? <TimerAfterZeroField form={props.form} /> : null}
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
    }
  >,
) {
  const spaces = useTimerStore((s) => s.spaces ?? [])
  const timers = useTimerStore((s) => s.timers ?? [])
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId ?? null)
  const defaultTz = useDefaultTimeZone()
  const browserTz = useBrowserTimeZone()
  const nowMs = useNow()
  const [step, setStep] = useState<TimerFormStep>(1)
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
      }),
    [activeSpaceId, defaultTz, nowMs, props.initial, props.mode],
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

  const labelLength = label.trim().length
  const descriptionLength = description.trim().length
  const labelPlaceholder = useMemo(() => nextDefaultTimerLabel(timers), [timers])
  const currentStepValid = isTimerFormStepValid(step, values)
  const scheduleValid = isTimerFormStepValid(2, values)

  const isPastDate = useMemo(() => {
    if (scheduleMode === "in") return false
    if (!scheduleValid) return false
    const targetDate = wallClockToUtcIso({ date, time, timezone })
    return new Date(targetDate).getTime() < nowMs
  }, [date, nowMs, scheduleMode, scheduleValid, time, timezone])

  const isEdit = props.mode === "edit"
  const notifyBlockedByPastDate = notify && isPastDate
  const currentStepReady = currentStepValid && !(step === 2 && notifyBlockedByPastDate)
  const basicsValid = isTimerFormStepValid(1, values)
  const editSaveDisabled = !basicsValid || !scheduleValid || notifyBlockedByPastDate

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

  async function handleNotifyChange(checked: boolean) {
    const result = await resolveNotifyToggle(checked, Boolean(session.data?.user))
    if (result.errorKey) toast.error(formatMessage(result.errorKey))
    form.setValue("notify", result.checked, { shouldDirty: true, shouldValidate: true })
  }

  async function handleNextStep(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    const valid = await form.trigger(timerFormStepFields[step], { shouldFocus: true })
    if (!valid) return
    if (step === 2 && notifyBlockedByPastDate) {
      toast.error(formatMessage("notifications.futureOnly"))
      return
    }
    setStep(nextStep(step))
  }

  function handleSubmit(values: TimerFormValues) {
    const parsed = timerFormSchema.parse(values)
    if (parsed.notify && isPastDate) {
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
      recurrence: durationMode ? undefined : recurrenceForSubmit(parsed),
      spaceId: parsed.spaceId || undefined,
      image: parsed.image ?? undefined,
      afterZero: parsed.repeatEnabled ? undefined : timerAfterZeroFromForm(parsed),
    })
    props.onOpenChange(false)
  }

  return (
    <DialogContent sheetOnMobile>
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
            isPastDate={isPastDate}
            onNotifyChange={(checked) => void handleNotifyChange(checked)}
          />
        ) : (
          <>
            <TimerFormStepper step={step} />

            <div className="grid min-h-[280px] content-start gap-4">
              <TimerStepContent
                currentStep={step}
                descriptionLength={descriptionLength}
                form={form}
                isPastDate={isPastDate}
                labelLength={labelLength}
                labelPlaceholder={labelPlaceholder}
                localTz={browserTz}
                repeatEnabled={repeatEnabled}
                repeatPreview={repeatPreview}
                repeatType={repeatType}
                scheduleMode={scheduleMode}
                spaces={spaces}
                timezone={timezone}
                onNotifyChange={(checked) => void handleNotifyChange(checked)}
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
  const open = props.open ?? internalOpen
  const setOpen = props.onOpenChange ?? setInternalOpen
  const contentKey = `${props.mode}-${props.initial?.id ?? "new"}-${props.initial?.updatedAt ?? "current"}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.open === undefined ? (
        <DialogTrigger asChild>
          {props.trigger ?? <Button>{formatMessage("timer.form.newTimerButton")}</Button>}
        </DialogTrigger>
      ) : null}
      {open ? (
        <TimerFormContent
          key={contentKey}
          mode={props.mode}
          initial={props.initial}
          onOpenChange={setOpen}
          onSubmit={props.onSubmit}
        />
      ) : null}
    </Dialog>
  )
}
