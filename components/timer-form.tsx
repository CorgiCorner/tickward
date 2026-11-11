import { zodResolver } from "@hookform/resolvers/zod"
import { formatInTimeZone } from "date-fns-tz"
import { useId, useMemo, useState, type ReactNode } from "react"
import { useForm, useWatch, type FieldErrors } from "react-hook-form"
import { toast } from "sonner"

import { MENU_MOTION_CLASSNAME } from "@/components/dashboard/motion"
import { SignInDialog } from "@/components/sign-in-auth"
import { StartCountUpFromDate } from "@/components/start-count-up-from-date"
import {
  ScheduleModeSwitch,
  TimerAlertsSection,
  TimerDirectionSection,
  TimerMilestonesField,
  TimerNameSection,
  TimerPhotoSection,
  TimerRepeatSection,
  TimerWhenSection,
} from "@/components/timer-form-sections"
import { FadeInText, RevealRow } from "@/components/timer-form/reveal"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth/auth-client"
import { runInBackground } from "@/lib/background-task"
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
  timerAfterZeroFromForm,
  timerTemplateFormSeed,
  type TimerCreationTemplateId,
  type TimerFormSubmitValue,
  type TimerFormValues,
} from "@/lib/schemas/timer"
import { useTimerStore } from "@/lib/store"
import { timerAlertReadiness } from "@/lib/timer-alert-readiness.client"
import type { Timer } from "@/lib/types"
import { UNASSIGNED_SPACE_ID } from "@/lib/types"
import {
  cn,
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
  /**
   * "dialog" (default) opens the form in its own dialog. "inline" renders it into
   * the host dialog it replaces (the timer detail view); closing it, by Save or
   * Back, hands the place back to the host.
   */
  surface?: "dialog" | "inline"
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

type NotifyToggleResult = {
  checked: boolean
  errorKey?: MessageKey
}

async function resolveNotifyToggle(checked: boolean, signedIn: boolean): Promise<NotifyToggleResult> {
  if (!checked) return { checked: false }

  const readiness = timerAlertReadiness({ signedIn })
  return readiness.ready ? { checked: true } : { checked: false, errorKey: readiness.messageKey }
}

const FOOTER_ERROR_FIELDS = [
  "date",
  "time",
  "durationMinutes",
  "milestoneRules",
  "label",
  "url",
  "afterZeroMinutes",
  "reminders",
  "scheduleMode",
  "repeatEnabled",
] as const

function firstErrorMessage(errors: FieldErrors<TimerFormValues>) {
  for (const name of FOOTER_ERROR_FIELDS) {
    const error = errors[name]
    if (!error) continue
    if (typeof error.message === "string" && error.message) return error.message
    if (Array.isArray(error)) {
      const nested = error.find((item) => item && typeof item === "object")
      const message = nested?.message ?? nested?.offsetMinutes?.message
      if (typeof message === "string" && message) return message
    }
  }
  return null
}

// One line left of the primary action. What blocks the timer wins; otherwise
// signed-out people learn where the timer is kept.
function footerStatus(args: {
  errors: FieldErrors<TimerFormValues>
  submitted: boolean
  scheduleMode: TimerFormValues["scheduleMode"]
  date: string
  durationSeconds: number
  notifyBlockedByPastDate: boolean
  signedIn: boolean
  isEdit: boolean
}): { text: string; tone: "muted" | "error" } | null {
  const error = args.submitted ? firstErrorMessage(args.errors) : null
  if (error) return { text: error, tone: "error" }
  const tone = args.submitted ? "error" : "muted"
  if (args.scheduleMode === "at" && !args.date) return { text: formatMessage("timer.form.footer.missingDate"), tone }
  if (args.scheduleMode === "in" && args.durationSeconds < 1) {
    return { text: formatMessage("validation.durationTooShort"), tone }
  }
  if (args.notifyBlockedByPastDate) return { text: formatMessage("notifications.futureOnly.inline"), tone }
  if (!args.signedIn && !args.isEdit) return { text: formatMessage("timer.form.footer.local"), tone: "muted" }
  return null
}

function TimerFormFooter(
  props: Readonly<{
    formId: string
    mode: Mode
    status: ReturnType<typeof footerStatus>
  }>,
) {
  const statusId = useId()
  // Rendered inside DialogFooter at the DialogContent level: the dialog pins
  // only direct DialogFooter children, so the wrapper must not own it.
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="min-w-0 flex-1" aria-live="polite">
        {props.status ? (
          <FadeInText
            key={props.status.text}
            id={statusId}
            className={cn("text-xs", props.status.tone === "error" ? "text-destructive" : "text-muted-foreground")}
          >
            {props.status.text}
          </FadeInText>
        ) : null}
      </div>
      <Button
        form={props.formId}
        type="submit"
        className="shrink-0 transition-[color,background-color,transform] duration-press active:scale-[0.97] motion-reduce:active:scale-100"
        aria-describedby={props.status?.tone === "error" ? statusId : undefined}
      >
        {formatMessage(props.mode === "create" ? "timer.form.createTimer" : "common.save")}
      </Button>
    </div>
  )
}

function hasOptionalDetails(timer: Timer | undefined) {
  return Boolean(timer?.description || timer?.url || timer?.spaceId)
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
  const session = authClient.useSession()
  const signedIn = Boolean(session.data?.user)
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
    if (form.formState.submitCount > 0) void form.trigger()
  }

  async function handleNotifyChange(checked: boolean) {
    const result = await resolveNotifyToggle(checked, signedIn)
    if (result.errorKey) toast.error(formatMessage(result.errorKey))
    form.setValue("notify", result.checked, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  function handleSubmit(values: TimerFormValues) {
    const parsed = timerFormSchema.parse(values)
    if (parsed.timerMode !== "since" && parsed.notify && isPastDate) {
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

  const status = footerStatus({
    errors: form.formState.errors,
    submitted: form.formState.submitCount > 0,
    scheduleMode,
    date,
    durationSeconds: durationTotalSeconds(values),
    notifyBlockedByPastDate,
    signedIn,
    isEdit,
  })
  const sinceMode = timerMode === "since"
  const durationMode = !isEdit && scheduleMode === "in" && !sinceMode

  const header = (
    <DialogHeader>
      <DialogTitle>
        {formatMessage(props.mode === "create" ? "timer.form.createTitle" : "timer.form.editTitle")}
      </DialogTitle>
      <DialogDescription className="sr-only">{formatMessage("timer.form.dialogDescription")}</DialogDescription>
    </DialogHeader>
  )

  const formFields = (
    <form id={formId} noValidate onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-5">
      <TimerNameSection
        control={form.control}
        register={form.register}
        spaces={spaces}
        labelLength={labelLength}
        descriptionLength={descriptionLength}
        labelPlaceholder={labelPlaceholder}
        autoFocus={!isEdit && !(props.fromTemplateMenu && props.templateId !== "blank")}
        detailsInitiallyOpen={isEdit && hasOptionalDetails(props.initial)}
      />

      <TimerDirectionSection
        timerMode={timerMode}
        onTimerModeChange={handleTimerModeChange}
        locked={isEdit}
        hintAction={isEdit || sinceMode ? null : <ScheduleModeSwitch control={form.control} />}
        lockedAction={
          isEdit ? <StartCountUpFromDate timer={props.initial!} onComplete={() => props.onOpenChange(false)} /> : null
        }
      />

      <TimerWhenSection
        control={form.control}
        allowScheduleMode={!isEdit}
        localTz={browserTz}
        scheduleMode={scheduleMode}
        timerMode={timerMode}
        directionSuggestion={directionSuggestion}
        focusDateOnMount={props.fromTemplateMenu && props.templateId !== "blank"}
        livePreview={livePreview}
        onTimerModeChange={handleTimerModeChange}
      />

      {sinceMode ? (
        <RevealRow>
          <TimerMilestonesField control={form.control} preview={milestonePreview} timezone={timezone} />
        </RevealRow>
      ) : null}

      <TimerAlertsSection
        control={form.control}
        timerMode={timerMode}
        isPastDate={isPastDate}
        signedIn={signedIn}
        signInAction={
          <SignInDialog onCompleted={() => runInBackground("timerForm.sessionRefetch", session.refetch?.())} />
        }
        onNotifyChange={(checked) => void handleNotifyChange(checked)}
      />

      {sinceMode ? null : (
        <RevealRow>
          <TimerRepeatSection
            control={form.control}
            repeatPreview={repeatPreview}
            timezone={timezone}
            showRepeat={!durationMode}
          />
        </RevealRow>
      )}

      <TimerPhotoSection control={form.control} />
    </form>
  )

  if (props.surface === "inline") {
    // The same header, scrolling body and pinned footer as the dialog, laid out
    // inside the host's panel.
    return (
      <div data-slot="timer-form-inline" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pt-5 md:px-7 md:pt-6">{header}</div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 md:px-7">
          {formFields}
        </div>
        <div className="shrink-0 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:px-7 md:pb-4">
          <TimerFormFooter formId={formId} mode={props.mode} status={status} />
        </div>
      </div>
    )
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
      {header}

      {formFields}
      <DialogFooter className="flex-row">
        <TimerFormFooter formId={formId} mode={props.mode} status={status} />
      </DialogFooter>
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
      surface={props.surface}
    />
  ) : null

  if (props.surface === "inline") return content

  if (props.open === undefined && props.mode === "create") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {props.trigger ?? <Button>{formatMessage("timer.form.newTimerButton")}</Button>}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className={cn("min-w-56", MENU_MOTION_CLASSNAME)}
            onCloseAutoFocus={(event) => event.preventDefault()}>
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
