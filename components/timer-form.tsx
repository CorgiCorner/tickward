import { zodResolver } from "@hookform/resolvers/zod"
import { formatInTimeZone } from "date-fns-tz"
import { useMemo, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import {
  TimerBasicsSection,
  TimerCustomizeSection,
  TimerFormStepper,
  TimerScheduleSection,
} from "@/components/timer-form-sections"
import { useNow } from "@/components/use-now"
import { Button } from "@/components/ui/button"
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
import { formatMessage, type MessageKey } from "@/lib/i18n/messages"
import {
  isTimerFormStepValid,
  timerFormSchema,
  timerFormStepFields,
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
    timezone,
    date: targetDate ? formatInTimeZone(targetDate, timezone, "yyyy-MM-dd") : "",
    time: targetDate ? formatInTimeZone(targetDate, timezone, "HH:mm") : "09:00",
    notify: args.initial?.notification?.enabled ?? args.initial?.notify ?? false,
    repeatEnabled: args.initial?.recurrence?.enabled ?? false,
    repeatType: args.initial?.recurrence?.type ?? "yearly",
    lastDay: args.initial?.recurrence?.lastDay ?? false,
    spaceId: args.initial?.spaceId ?? activeSpaceId,
    image: args.initial?.image ?? null,
  }
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
    localTz: string
    onNotifyChange: (checked: boolean) => void
    repeatEnabled: boolean
    repeatPreview: string[]
    repeatType: TimerFormValues["repeatType"]
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
      />
    )
  }

  if (props.currentStep === 2) {
    return (
      <TimerScheduleSection
        control={props.form.control}
        localTz={props.localTz}
        timezone={props.timezone}
        repeatEnabled={props.repeatEnabled}
        repeatType={props.repeatType}
        repeatPreview={props.repeatPreview}
        isPastDate={props.isPastDate}
        onNotifyChange={props.onNotifyChange}
      />
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
    onBack: () => void
    onNext: (event: MouseEvent<HTMLButtonElement>) => void
    scheduleValid: boolean
  }>,
) {
  return (
    <DialogFooter className="flex-row gap-2">
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
          type="submit"
          disabled={!props.currentStepValid || !props.scheduleValid || props.notifyBlockedByPastDate}
        >
          {formatMessage(props.mode === "create" ? "common.create" : "common.save")}
        </Button>
      )}
    </DialogFooter>
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
  const activeSpaceId = useTimerStore((s) => s.activeSpaceId ?? null)
  const defaultTz = useDefaultTimeZone()
  const browserTz = useBrowserTimeZone()
  const nowMs = useNow()
  const [step, setStep] = useState<TimerFormStep>(1)
  const session = authClient.useSession()

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
  const notify = values.notify ?? false
  const repeatEnabled = values.repeatEnabled ?? false
  const repeatType = values.repeatType ?? "yearly"
  const lastDay = values.lastDay ?? false

  const labelLength = label.trim().length
  const descriptionLength = description.trim().length
  const currentStepValid = isTimerFormStepValid(step, values)
  const scheduleValid = isTimerFormStepValid(2, values)

  const isPastDate = useMemo(() => {
    if (!scheduleValid) return false
    const targetDate = wallClockToUtcIso({ date, time, timezone })
    return new Date(targetDate).getTime() < nowMs
  }, [date, nowMs, scheduleValid, time, timezone])

  const notifyBlockedByPastDate = notify && isPastDate
  const currentStepReady = currentStepValid && !(step === 2 && notifyBlockedByPastDate)

  const firstOccurrence = useMemo(() => {
    if (!repeatEnabled || !scheduleValid) return null
    const anchor = wallClockToUtcIso({ date, time, timezone })
    const slot = recurrenceSlot(anchor, repeatType, timezone, lastDay)
    return nextSlotOccurrence(slot, timezone, nowMs - 1) ?? anchor
  }, [date, lastDay, nowMs, repeatEnabled, repeatType, scheduleValid, time, timezone])

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

    const picked = wallClockToUtcIso({
      date: parsed.date,
      time: parsed.time,
      timezone: parsed.timezone,
    })
    const targetDate = parsed.repeatEnabled ? (firstOccurrence ?? picked) : picked

    props.onSubmit({
      label: parsed.label,
      description: parsed.description || undefined,
      targetDate,
      timezone: parsed.timezone,
      notify: parsed.notify,
      recurrence: recurrenceForSubmit(parsed),
      spaceId: parsed.spaceId || undefined,
      image: parsed.image ?? undefined,
    })
    props.onOpenChange(false)
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {formatMessage(props.mode === "create" ? "timer.form.createTitle" : "timer.form.editTitle")}
        </DialogTitle>
        <DialogDescription className="sr-only">{formatMessage("timer.form.dialogDescription")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
        <TimerFormStepper step={step} />

        <div className="grid min-h-[280px] content-start gap-4">
          <TimerStepContent
            currentStep={step}
            descriptionLength={descriptionLength}
            form={form}
            isPastDate={isPastDate}
            labelLength={labelLength}
            localTz={browserTz}
            repeatEnabled={repeatEnabled}
            repeatPreview={repeatPreview}
            repeatType={repeatType}
            spaces={spaces}
            timezone={timezone}
            onNotifyChange={(checked) => void handleNotifyChange(checked)}
          />
        </div>

        <TimerFormFooter
          currentStep={step}
          currentStepReady={currentStepReady}
          currentStepValid={currentStepValid}
          mode={props.mode}
          notifyBlockedByPastDate={notifyBlockedByPastDate}
          scheduleValid={scheduleValid}
          onBack={() => setStep(previousStep(step))}
          onNext={(event) => void handleNextStep(event)}
        />
      </form>
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
