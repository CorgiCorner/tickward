"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CirclePlayIcon,
  CircleStopIcon,
  HistoryIcon,
  PencilIcon,
  PlusIcon,
  RadioTowerIcon,
  SendIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ConfirmActionButton } from "@/components/confirm-action-button"
import { SecretRevealField } from "@/components/secret-reveal-field"
import { formatSettingsDate } from "@/components/settings-metadata"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMessage } from "@/lib/i18n/messages"
import {
  WEBHOOK_EVENT_TYPES,
  webhookEndpointNameSchema,
  webhookEndpointUrlSchema,
  webhookEventTypesSchema,
  type WebhookDeliveryPublicRecord,
  type WebhookEndpointPublicRecord,
  type WebhookEventType,
} from "@/lib/webhook-events"

const webhookFormSchema = z.object({
  name: webhookEndpointNameSchema,
  url: webhookEndpointUrlSchema,
  event_types: webhookEventTypesSchema,
})

type WebhookFormValues = z.infer<typeof webhookFormSchema>

type CreatedWebhookEndpoint = WebhookEndpointPublicRecord & {
  signing_secret: string
}

type TestWebhookResult = {
  object: "webhook_test"
  endpoint: WebhookEndpointPublicRecord
  delivery: {
    id: string
    object: "webhook_delivery"
    status: "pending" | "processing" | "delivered" | "failed"
    response_status: number | null
    error: string | null
  }
}

class WebhookRequestError extends Error {
  constructor(
    message: string,
    readonly type: string | null,
    readonly status: number,
  ) {
    super(message)
    this.name = "WebhookRequestError"
  }
}

async function responseJson<T>(res: Response, fallback: string): Promise<T> {
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const type =
      data && typeof data === "object" && "error" in data
        ? ((data as { error?: { type?: unknown } }).error?.type ?? null)
        : null
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: { message?: unknown } }).error?.message ?? fallback)
        : fallback
    throw new WebhookRequestError(message, typeof type === "string" ? type : null, res.status)
  }
  return data as T
}

async function fetchWebhooks() {
  const res = await fetch("/api/account/webhooks", { cache: "no-store" })
  const data = await responseJson<{ data?: WebhookEndpointPublicRecord[] }>(res, formatMessage("webhooks.loadFailed"))
  return Array.isArray(data.data) ? data.data : []
}

async function createWebhook(input: { event_types: WebhookEventType[]; name: string; url: string }) {
  const res = await fetch("/api/account/webhooks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
  return responseJson<CreatedWebhookEndpoint>(res, formatMessage("webhooks.createFailed"))
}

async function disableWebhook(id: string) {
  const res = await fetch(`/api/account/webhooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "disabled" }),
  })
  return responseJson<WebhookEndpointPublicRecord>(res, formatMessage("webhooks.disableFailed"))
}

async function updateWebhookEvents(id: string, eventTypes: WebhookEventType[]) {
  const res = await fetch(`/api/account/webhooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event_types: eventTypes }),
  })
  return responseJson<WebhookEndpointPublicRecord>(res, formatMessage("webhooks.eventsUpdateFailed"))
}

async function removeWebhook(id: string) {
  const res = await fetch(`/api/account/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" })
  await responseJson<unknown>(res, formatMessage("webhooks.removeFailed"))
}

async function sendTestWebhook(id: string, eventType?: WebhookEventType) {
  const res = await fetch(`/api/account/webhooks/${encodeURIComponent(id)}/test`, {
    method: "POST",
    ...(eventType
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ event_type: eventType }) }
      : {}),
  })
  return responseJson<TestWebhookResult>(res, formatMessage("webhooks.testFailed"))
}

async function fetchWebhookDeliveries(id: string) {
  const res = await fetch(`/api/account/webhooks/${encodeURIComponent(id)}/deliveries`, { cache: "no-store" })
  const data = await responseJson<{ data?: WebhookDeliveryPublicRecord[] }>(
    res,
    formatMessage("webhooks.deliveriesLoadFailed"),
  )
  return Array.isArray(data.data) ? data.data : []
}

async function reenableWebhook(id: string) {
  const res = await fetch(`/api/account/webhooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  })
  return responseJson<WebhookEndpointPublicRecord>(res, formatMessage("webhooks.reenableFailed"))
}

function webhookLoadErrorMessage(error: unknown) {
  if (error instanceof WebhookRequestError) {
    if (error.type === "storage_unavailable" || error.type === "rate_limit_unavailable" || error.status >= 500) {
      return formatMessage("webhooks.unavailable")
    }
    return error.message
  }
  return formatMessage("webhooks.loadFailed")
}

function withoutSigningSecret(record: CreatedWebhookEndpoint): WebhookEndpointPublicRecord {
  return {
    id: record.id,
    object: record.object,
    name: record.name,
    url: record.url,
    event_types: record.event_types,
    status: record.status,
    failure_count: record.failure_count,
    created_at: record.created_at,
    updated_at: record.updated_at,
    disabled_at: record.disabled_at,
    last_delivered_at: record.last_delivered_at,
    last_failed_at: record.last_failed_at,
  }
}

function EventTypeChoice(
  props: Readonly<{
    selected: WebhookEventType[]
    setSelected: (types: WebhookEventType[]) => void
  }>,
) {
  const selected = new Set(props.selected)

  return (
    <div className="grid gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Label>{formatMessage("webhooks.events")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatMessage("webhooks.eventsSelected", {
              count: props.selected.length,
              total: WEBHOOK_EVENT_TYPES.length,
            })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={props.selected.length === WEBHOOK_EVENT_TYPES.length}
            onClick={() => props.setSelected([...WEBHOOK_EVENT_TYPES])}
          >
            {formatMessage("webhooks.selectAllEvents")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={props.selected.length === 0}
            onClick={() => props.setSelected([])}
          >
            {formatMessage("webhooks.clearEvents")}
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {WEBHOOK_EVENT_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(type)}
              onChange={(event) => {
                const next = new Set(selected)
                if (event.target.checked) next.add(type)
                else next.delete(type)
                props.setSelected([...next])
              }}
            />
            <span className="font-mono text-xs">{type}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function CreatedWebhookPanel(props: Readonly<{ created: CreatedWebhookEndpoint }>) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-1">
        <div className="text-sm font-medium">{formatMessage("webhooks.createdTitle")}</div>
        <p className="text-xs text-muted-foreground">{formatMessage("webhooks.createdDescription")}</p>
      </div>
      <SecretRevealField
        value={props.created.signing_secret}
        copyLabel={formatMessage("webhooks.copySecret")}
        copiedMessage={formatMessage("webhooks.secretCopied")}
      />
    </div>
  )
}

function deliveryStatusLabel(status: WebhookDeliveryPublicRecord["status"]) {
  if (status === "delivered") return formatMessage("webhooks.deliveryStatus.delivered")
  if (status === "failed") return formatMessage("webhooks.deliveryStatus.failed")
  if (status === "processing") return formatMessage("webhooks.deliveryStatus.processing")
  return formatMessage("webhooks.deliveryStatus.pending")
}

function WebhookMetadataItem(props: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="grid gap-0.5">
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
      <div className="text-xs text-foreground/80">{props.value}</div>
    </div>
  )
}

function WebhookDateMetadata(props: Readonly<{ label: string; value: string | null }>) {
  return <WebhookMetadataItem label={props.label} value={formatSettingsDate(props.value)} />
}

function WebhookDeliveryRow(props: Readonly<{ delivery: WebhookDeliveryPublicRecord }>) {
  const failed = props.delivery.status === "failed"
  return (
    <div className="grid gap-2 rounded-md border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            failed
              ? "rounded-full border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive"
              : "rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
          }
        >
          {deliveryStatusLabel(props.delivery.status)}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <WebhookMetadataItem
          label={formatMessage("webhooks.deliveryAttemptsLabel")}
          value={props.delivery.attempt_count}
        />
        {props.delivery.response_status != null ? (
          <WebhookMetadataItem
            label={formatMessage("webhooks.deliveryHttpLabel")}
            value={props.delivery.response_status}
          />
        ) : null}
        <WebhookDateMetadata
          label={formatMessage("webhooks.deliveryLastAttemptLabel")}
          value={props.delivery.last_attempt_at}
        />
        {props.delivery.next_attempt_at ? (
          <WebhookDateMetadata
            label={formatMessage("webhooks.deliveryNextAttemptLabel")}
            value={props.delivery.next_attempt_at}
          />
        ) : null}
        <WebhookDateMetadata label={formatMessage("webhooks.deliveryCreatedLabel")} value={props.delivery.created_at} />
      </div>
      {props.delivery.error ? (
        <p className="break-words rounded-md bg-destructive/5 px-2 py-1 text-destructive">{props.delivery.error}</p>
      ) : null}
    </div>
  )
}

function WebhookDeliveriesSection(props: Readonly<{ endpointId: string }>) {
  const [deliveries, setDeliveries] = useState<WebhookDeliveryPublicRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchWebhookDeliveries(props.endpointId)
      .then((records) => {
        if (!cancelled) setDeliveries(records)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : formatMessage("webhooks.deliveriesLoadFailed"))
      })
    return () => {
      cancelled = true
    }
  }, [props.endpointId])

  if (error) {
    return <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">{error}</div>
  }
  if (deliveries === null) {
    return <div className="text-xs text-muted-foreground">{formatMessage("webhooks.deliveriesLoading")}</div>
  }
  if (deliveries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        {formatMessage("webhooks.deliveriesEmpty")}
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      {deliveries.map((delivery) => (
        <WebhookDeliveryRow key={delivery.id} delivery={delivery} />
      ))}
    </div>
  )
}

function WebhookEndpointRow(
  props: Readonly<{
    endpoint: WebhookEndpointPublicRecord
    disableLoading: string | null
    eventsLoading: string | null
    removeLoading: string | null
    onSendTest: (id: string, eventType?: WebhookEventType) => void
    onDisable: (id: string) => void
    onEventsUpdate: (id: string, eventTypes: WebhookEventType[]) => Promise<boolean>
    onRemove: (id: string) => void
    onReenable: (id: string) => void
    reenableLoading: string | null
    testLoading: string | null
  }>,
) {
  const disabled = props.endpoint.status === "disabled"
  const [deliveriesOpen, setDeliveriesOpen] = useState(false)
  const [testMenuOpen, setTestMenuOpen] = useState(false)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventType[]>(props.endpoint.event_types)
  const eventEditBusy = props.eventsLoading === props.endpoint.id
  const endpointBusy =
    props.disableLoading === props.endpoint.id ||
    props.eventsLoading === props.endpoint.id ||
    props.removeLoading === props.endpoint.id ||
    props.reenableLoading === props.endpoint.id ||
    props.testLoading === props.endpoint.id

  function openEventsDialog() {
    setSelectedEvents(props.endpoint.event_types)
    setEventsOpen(true)
  }

  async function submitEventsUpdate() {
    const ok = await props.onEventsUpdate(props.endpoint.id, selectedEvents)
    if (ok) setEventsOpen(false)
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-sm font-medium">{props.endpoint.name}</div>
            <span
              className={
                disabled
                  ? "rounded-full border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive"
                  : "rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
              }
            >
              {formatMessage(disabled ? "webhooks.status.disabled" : "webhooks.status.active")}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{props.endpoint.url}</div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {disabled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={props.reenableLoading === props.endpoint.id}
              disabled={endpointBusy && props.reenableLoading !== props.endpoint.id}
              onClick={() => props.onReenable(props.endpoint.id)}
            >
              {props.reenableLoading !== props.endpoint.id ? <CirclePlayIcon className="size-4" /> : null}
              {formatMessage("webhooks.reenable")}
            </Button>
          ) : (
            <Popover open={testMenuOpen} onOpenChange={setTestMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={props.testLoading === props.endpoint.id}
                  disabled={endpointBusy && props.testLoading !== props.endpoint.id}
                >
                  {props.testLoading !== props.endpoint.id ? <SendIcon className="size-4" /> : null}
                  {formatMessage("webhooks.test")}
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="grid w-56 gap-0.5 p-1">
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {formatMessage("webhooks.testMenuLabel")}
                </div>
                <button
                  type="button"
                  className="rounded-sm px-2 py-1.5 text-left font-mono text-xs hover:bg-muted"
                  onClick={() => {
                    setTestMenuOpen(false)
                    props.onSendTest(props.endpoint.id)
                  }}
                >
                  webhook.test
                </button>
                {props.endpoint.event_types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="rounded-sm px-2 py-1.5 text-left font-mono text-xs hover:bg-muted"
                    onClick={() => {
                      setTestMenuOpen(false)
                      props.onSendTest(props.endpoint.id, type)
                    }}
                  >
                    {type}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <Dialog open={eventsOpen} onOpenChange={(open) => (open ? openEventsDialog() : setEventsOpen(false))}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={endpointBusy} onClick={openEventsDialog}>
                <PencilIcon className="size-4" />
                {formatMessage("webhooks.editEvents")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[min(680px,90dvh)] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{formatMessage("webhooks.editEventsTitle")}</DialogTitle>
                <DialogDescription>{formatMessage("webhooks.editEventsDescription")}</DialogDescription>
              </DialogHeader>
              <EventTypeChoice selected={selectedEvents} setSelected={setSelectedEvents} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEventsOpen(false)}>
                  {formatMessage("common.cancel")}
                </Button>
                <Button
                  type="button"
                  loading={eventEditBusy}
                  disabled={selectedEvents.length === 0}
                  onClick={() => void submitEventsUpdate()}
                >
                  {formatMessage("common.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {!disabled ? (
            <ConfirmActionButton
              actionLabel={formatMessage("webhooks.disableAction")}
              confirmAction={() => props.onDisable(props.endpoint.id)}
              description={formatMessage("webhooks.disableConfirmDescription")}
              icon={<CircleStopIcon className="size-4" />}
              loading={props.disableLoading === props.endpoint.id}
              disabled={endpointBusy && props.disableLoading !== props.endpoint.id}
              title={formatMessage("webhooks.disableConfirmTitle")}
            >
              {formatMessage("webhooks.disable")}
            </ConfirmActionButton>
          ) : null}
          <ConfirmActionButton
            actionLabel={formatMessage("webhooks.removeAction")}
            confirmAction={() => props.onRemove(props.endpoint.id)}
            description={formatMessage("webhooks.removeConfirmDescription")}
            icon={<Trash2Icon className="size-4" />}
            loading={props.removeLoading === props.endpoint.id}
            disabled={endpointBusy && props.removeLoading !== props.endpoint.id}
            title={formatMessage("webhooks.removeConfirmTitle")}
          >
            {formatMessage("webhooks.remove")}
          </ConfirmActionButton>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {props.endpoint.event_types.map((type) => (
          <span key={type} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {type}
          </span>
        ))}
      </div>
      <div className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div data-slot="webhook-endpoint-metadata" className="grid gap-1 text-xs">
          <WebhookDateMetadata label={formatMessage("apiKeys.createdLabel")} value={props.endpoint.created_at} />
          <WebhookDateMetadata
            label={formatMessage("webhooks.lastDeliveredLabel")}
            value={props.endpoint.last_delivered_at}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="justify-self-start sm:justify-self-end"
          onClick={() => setDeliveriesOpen((open) => !open)}
        >
          <HistoryIcon className="size-3.5" />
          {formatMessage("webhooks.deliveries")}
          {deliveriesOpen ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
        </Button>
      </div>
      {deliveriesOpen ? <WebhookDeliveriesSection endpointId={props.endpoint.id} /> : null}
    </div>
  )
}

export function WebhooksSettingsPanel(
  props: Readonly<{
    docsHref?: string | null
    initialLoadError?: string | null
    initialWebhooks?: WebhookEndpointPublicRecord[]
  }> = {},
) {
  const hasSettledInitialLoad = props.initialWebhooks !== undefined || props.initialLoadError !== undefined
  const [webhooks, setWebhooks] = useState<WebhookEndpointPublicRecord[]>(() => props.initialWebhooks ?? [])
  const [createOpen, setCreateOpen] = useState(false)
  const [created, setCreated] = useState<CreatedWebhookEndpoint | null>(null)
  const [loading, setLoading] = useState(() => !hasSettledInitialLoad)
  const [loadError, setLoadError] = useState<string | null>(() => props.initialLoadError ?? null)
  const [createLoading, setCreateLoading] = useState(false)
  const [disableLoading, setDisableLoading] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)
  const [reenableLoading, setReenableLoading] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState<string | null>(null)
  const visibleWebhooks = useMemo(() => {
    const active = webhooks.filter((record) => record.status !== "disabled")
    const inactive = webhooks.filter((record) => record.status === "disabled")
    return [...active, ...inactive]
  }, [webhooks])

  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: { name: "", url: "", event_types: [] },
  })
  const formValues = form.watch()
  const urlError = form.formState.errors.url

  const loadWebhooks = useCallback((isCancelled: () => boolean = () => false) => {
    setLoadError(null)
    setLoading(true)
    void fetchWebhooks()
      .then((records) => {
        if (isCancelled()) return
        setWebhooks(records)
      })
      .catch((error: unknown) => {
        if (isCancelled()) return
        setWebhooks([])
        setLoadError(webhookLoadErrorMessage(error))
      })
      .finally(() => {
        if (!isCancelled()) setLoading(false)
      })
  }, [])

  function resetCreateDialog() {
    setCreated(null)
    form.reset()
  }

  function handleCreateOpenChange(nextOpen: boolean) {
    resetCreateDialog()
    setCreateOpen(nextOpen)
  }

  useEffect(() => {
    if (hasSettledInitialLoad) return
    let cancelled = false
    loadWebhooks(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [hasSettledInitialLoad, loadWebhooks])

  async function submitCreate(values: WebhookFormValues) {
    setCreateLoading(true)
    try {
      const next = await createWebhook({ event_types: values.event_types, name: values.name, url: values.url })
      setWebhooks((records) => [withoutSigningSecret(next), ...records])
      setLoadError(null)
      setCreated(next)
      toast.success(formatMessage("webhooks.created"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("webhooks.createFailed"))
    } finally {
      setCreateLoading(false)
    }
  }

  async function submitDisable(id: string) {
    setDisableLoading(id)
    try {
      const updated = await disableWebhook(id)
      setWebhooks((records) => records.map((record) => (record.id === id ? updated : record)))
      setLoadError(null)
      toast.success(formatMessage("webhooks.disabled"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("webhooks.disableFailed"))
    } finally {
      setDisableLoading(null)
    }
  }

  async function submitEventsUpdate(id: string, eventTypes: WebhookEventType[]) {
    setEventsLoading(id)
    try {
      const updated = await updateWebhookEvents(id, eventTypes)
      setWebhooks((records) => records.map((record) => (record.id === id ? updated : record)))
      setLoadError(null)
      toast.success(formatMessage("webhooks.eventsUpdated"))
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("webhooks.eventsUpdateFailed"))
      return false
    } finally {
      setEventsLoading(null)
    }
  }

  async function submitRemove(id: string) {
    setRemoveLoading(id)
    try {
      await removeWebhook(id)
      setWebhooks((records) => records.filter((record) => record.id !== id))
      setLoadError(null)
      toast.success(formatMessage("webhooks.removed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("webhooks.removeFailed"))
    } finally {
      setRemoveLoading(null)
    }
  }

  async function submitReenable(id: string) {
    setReenableLoading(id)
    try {
      const updated = await reenableWebhook(id)
      setWebhooks((records) => records.map((record) => (record.id === id ? updated : record)))
      setLoadError(null)
      toast.success(formatMessage("webhooks.reenabled"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("webhooks.reenableFailed"))
    } finally {
      setReenableLoading(null)
    }
  }

  async function submitTest(id: string, eventType?: WebhookEventType) {
    setTestLoading(id)
    try {
      const result = await sendTestWebhook(id, eventType)
      setWebhooks((records) => records.map((record) => (record.id === id ? result.endpoint : record)))
      setLoadError(null)
      if (result.delivery.status === "delivered") {
        toast.success(formatMessage("webhooks.testSent"))
      } else {
        toast.error(formatMessage("webhooks.testFailed"))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("webhooks.testFailed"))
    } finally {
      setTestLoading(null)
    }
  }

  let webhooksContent: ReactNode
  if (loading) {
    webhooksContent = <div className="text-sm text-muted-foreground">{formatMessage("webhooks.loading")}</div>
  } else if (loadError) {
    webhooksContent = (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{loadError}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-end sm:self-auto"
          onClick={() => loadWebhooks()}
        >
          {formatMessage("apiKeys.retry")}
        </Button>
      </div>
    )
  } else if (visibleWebhooks.length === 0) {
    webhooksContent = (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {formatMessage("webhooks.empty")}
      </div>
    )
  } else {
    webhooksContent = (
      <div className="grid gap-3">
        {visibleWebhooks.map((endpoint) => (
          <WebhookEndpointRow
            key={endpoint.id}
            endpoint={endpoint}
            disableLoading={disableLoading}
            eventsLoading={eventsLoading}
            removeLoading={removeLoading}
            reenableLoading={reenableLoading}
            testLoading={testLoading}
            onSendTest={(id, eventType) => void submitTest(id, eventType)}
            onDisable={(id) => void submitDisable(id)}
            onEventsUpdate={submitEventsUpdate}
            onRemove={(id) => void submitRemove(id)}
            onReenable={(id) => void submitReenable(id)}
          />
        ))}
      </div>
    )
  }

  return (
    <section id="webhooks" className="grid scroll-mt-6 gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <RadioTowerIcon className="size-4 text-muted-foreground" />
            {formatMessage("webhooks.title")}
          </div>
          <p className="text-sm text-muted-foreground">{formatMessage("webhooks.description")}</p>
        </div>
        <div data-slot="webhooks-actions" className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:shrink-0">
          {props.docsHref ? (
            <Button variant="outline" size="sm" asChild className="w-fit">
              <a href={props.docsHref} target="_blank" rel="noreferrer">
                <BookOpenIcon className="size-4" />
                {formatMessage("webhooks.docs")}
              </a>
            </Button>
          ) : null}
          <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <PlusIcon className="size-4" />
                {formatMessage("webhooks.create")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[min(720px,90dvh)] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{formatMessage("webhooks.createTitle")}</DialogTitle>
                <DialogDescription>{formatMessage("webhooks.createDescription")}</DialogDescription>
              </DialogHeader>
              <form className="grid gap-4" onSubmit={(event) => void form.handleSubmit(submitCreate)(event)}>
                {created ? <CreatedWebhookPanel created={created} /> : null}
                <div className="grid gap-2">
                  <Label htmlFor="webhook-name">{formatMessage("apiKeys.name")}</Label>
                  <Input
                    id="webhook-name"
                    maxLength={80}
                    placeholder={formatMessage("webhooks.namePlaceholder")}
                    {...form.register("name")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="webhook-url">{formatMessage("webhooks.url")}</Label>
                  <Input
                    id="webhook-url"
                    placeholder={formatMessage("webhooks.urlPlaceholder")}
                    aria-invalid={urlError ? true : undefined}
                    aria-describedby={urlError ? "webhook-url-error" : undefined}
                    {...form.register("url")}
                  />
                  {urlError ? (
                    <p id="webhook-url-error" className="text-xs text-destructive">
                      {formatMessage("webhooks.urlInvalid")}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
                  <p>{formatMessage("webhooks.securityNote")}</p>
                </div>
                <Controller
                  control={form.control}
                  name="event_types"
                  render={({ field }) => <EventTypeChoice selected={field.value} setSelected={field.onChange} />}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleCreateOpenChange(false)}>
                    {formatMessage("common.done")}
                  </Button>
                  <Button
                    type="submit"
                    loading={createLoading}
                    disabled={!formValues.name.trim() || !formValues.url.trim() || formValues.event_types.length === 0}
                  >
                    {formatMessage("webhooks.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {webhooksContent}
    </section>
  )
}
