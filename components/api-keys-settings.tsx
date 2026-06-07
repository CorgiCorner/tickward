"use client"

import { CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

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

type ApiKeyPermission = "full_access" | "read"

export type ApiKeyRecord = {
  id: string
  object: "api_key"
  name: string
  permission: ApiKeyPermission
  key_prefix: string
  key_last4: string
  created_at: string
  updated_at: string
  last_used_at: string | null
  revoked_at: string | null
}

type CreatedApiKey = ApiKeyRecord & {
  token: string
}

class ApiKeyRequestError extends Error {
  constructor(
    message: string,
    readonly type: string | null,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiKeyRequestError"
  }
}

function apiKeyLabel(record: ApiKeyRecord) {
  return `${record.key_prefix}...${record.key_last4}`
}

function withoutRawToken(record: CreatedApiKey): ApiKeyRecord {
  return {
    id: record.id,
    object: record.object,
    name: record.name,
    permission: record.permission,
    key_prefix: record.key_prefix,
    key_last4: record.key_last4,
    created_at: record.created_at,
    updated_at: record.updated_at,
    last_used_at: record.last_used_at,
    revoked_at: record.revoked_at,
  }
}

function formatDate(value: string | null) {
  if (!value) return formatMessage("apiKeys.never")
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
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
    throw new ApiKeyRequestError(message, typeof type === "string" ? type : null, res.status)
  }
  return data as T
}

async function fetchApiKeys() {
  const res = await fetch("/api/account/api-keys", { cache: "no-store" })
  const data = await responseJson<{ data?: ApiKeyRecord[] }>(res, formatMessage("apiKeys.loadFailed"))
  return Array.isArray(data.data) ? data.data : []
}

async function createApiKey(input: { name: string; permission: ApiKeyPermission }) {
  const res = await fetch("/api/account/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
  return responseJson<CreatedApiKey>(res, formatMessage("apiKeys.createFailed"))
}

async function revokeApiKey(id: string) {
  const res = await fetch(`/api/account/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" })
  await responseJson<unknown>(res, formatMessage("apiKeys.revokeFailed"))
}

function apiKeysLoadErrorMessage(error: unknown) {
  if (error instanceof ApiKeyRequestError) {
    if (error.type === "storage_unavailable" || error.type === "rate_limit_unavailable" || error.status >= 500) {
      return formatMessage("apiKeys.unavailable")
    }
    return error.message
  }
  return formatMessage("apiKeys.loadFailed")
}

function PermissionChoice(
  props: Readonly<{ permission: ApiKeyPermission; setPermission: (value: ApiKeyPermission) => void }>,
) {
  return (
    <div className="grid gap-2">
      <Label>{formatMessage("apiKeys.permission")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {(["read", "full_access"] as const).map((permission) => (
          <Button
            key={permission}
            type="button"
            variant={props.permission === permission ? "default" : "outline"}
            onClick={() => props.setPermission(permission)}
          >
            {formatMessage(permission === "read" ? "apiKeys.permission.read" : "apiKeys.permission.fullAccess")}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {formatMessage(
          props.permission === "read" ? "apiKeys.permission.readDescription" : "apiKeys.permission.fullDescription",
        )}
      </p>
    </div>
  )
}

function CreatedTokenPanel(props: Readonly<{ created: CreatedApiKey }>) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-1">
        <div className="text-sm font-medium">{formatMessage("apiKeys.createdTitle")}</div>
        <p className="text-xs text-muted-foreground">{formatMessage("apiKeys.createdDescription")}</p>
      </div>
      <div className="flex gap-2">
        <Input value={props.created.token} readOnly className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={formatMessage("apiKeys.copyToken")}
          onClick={async () => {
            await navigator.clipboard.writeText(props.created.token)
            toast.success(formatMessage("apiKeys.copied"))
          }}
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function ApiKeyRow(
  props: Readonly<{
    record: ApiKeyRecord
    revokeLoading: string | null
    onRevoke: (id: string) => void
  }>,
) {
  const revoked = Boolean(props.record.revoked_at)
  return (
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="truncate text-sm font-medium">{props.record.name}</div>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatMessage(
              props.record.permission === "read" ? "apiKeys.permission.read" : "apiKeys.permission.fullAccess",
            )}
          </span>
          {revoked ? (
            <span className="rounded-full border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive">
              {formatMessage("apiKeys.revoked")}
            </span>
          ) : null}
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{apiKeyLabel(props.record)}</div>
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <span>{formatMessage("apiKeys.createdAt", { date: formatDate(props.record.created_at) })}</span>
          <span>{formatMessage("apiKeys.lastUsedAt", { date: formatDate(props.record.last_used_at) })}</span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={props.revokeLoading === props.record.id}
        disabled={revoked}
        onClick={() => props.onRevoke(props.record.id)}
      >
        {!props.revokeLoading && <Trash2Icon className="size-4" />}
        {formatMessage("apiKeys.revoke")}
      </Button>
    </div>
  )
}

export function ApiKeysSettingsPanel(
  props: Readonly<{
    initialApiKeys?: ApiKeyRecord[]
    initialLoadError?: string | null
  }> = {},
) {
  const hasSettledInitialLoad = props.initialApiKeys !== undefined || props.initialLoadError !== undefined
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>(() => props.initialApiKeys ?? [])
  const [createOpen, setCreateOpen] = useState(false)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [loading, setLoading] = useState(() => !hasSettledInitialLoad)
  const [loadError, setLoadError] = useState<string | null>(() => props.initialLoadError ?? null)
  const [name, setName] = useState("")
  const [permission, setPermission] = useState<ApiKeyPermission>("read")
  const [createLoading, setCreateLoading] = useState(false)
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null)
  const activeKeys = useMemo(() => apiKeys.filter((record) => !record.revoked_at), [apiKeys])

  const loadApiKeys = useCallback((isCancelled: () => boolean = () => false) => {
    setLoadError(null)
    setLoading(true)
    void fetchApiKeys()
      .then((records) => {
        if (isCancelled()) return
        setApiKeys(records)
      })
      .catch((error: unknown) => {
        if (isCancelled()) return
        setApiKeys([])
        setLoadError(apiKeysLoadErrorMessage(error))
      })
      .finally(() => {
        if (!isCancelled()) setLoading(false)
      })
  }, [])

  function resetCreateDialog() {
    setCreated(null)
    setName("")
    setPermission("read")
  }

  function handleCreateOpenChange(nextOpen: boolean) {
    resetCreateDialog()
    setCreateOpen(nextOpen)
  }

  useEffect(() => {
    if (hasSettledInitialLoad) return
    let cancelled = false
    loadApiKeys(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [hasSettledInitialLoad, loadApiKeys])

  async function submitCreate() {
    const nextName = name.trim()
    if (!nextName) return
    setCreateLoading(true)
    try {
      const next = await createApiKey({ name: nextName, permission })
      setApiKeys((records) => [withoutRawToken(next), ...records])
      setLoadError(null)
      setCreated(next)
      setName("")
      toast.success(formatMessage("apiKeys.created"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("apiKeys.createFailed"))
    } finally {
      setCreateLoading(false)
    }
  }

  async function submitRevoke(id: string) {
    setRevokeLoading(id)
    try {
      await revokeApiKey(id)
      setApiKeys((records) =>
        records.map((record) => (record.id === id ? { ...record, revoked_at: new Date().toISOString() } : record)),
      )
      setLoadError(null)
      toast.success(formatMessage("apiKeys.revokedToast"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("apiKeys.revokeFailed"))
    } finally {
      setRevokeLoading(null)
    }
  }

  return (
    <section id="api-keys" className="grid scroll-mt-6 gap-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            {formatMessage("apiKeys.title")}
          </div>
          <p className="text-sm text-muted-foreground">{formatMessage("apiKeys.description")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <PlusIcon className="size-4" />
              {formatMessage("apiKeys.create")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{formatMessage("apiKeys.createTitle")}</DialogTitle>
              <DialogDescription>{formatMessage("apiKeys.createDescription")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {created ? <CreatedTokenPanel created={created} /> : null}
              <div className="grid gap-2">
                <Label htmlFor="api-key-name">{formatMessage("apiKeys.name")}</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  maxLength={80}
                  placeholder={formatMessage("apiKeys.namePlaceholder")}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <PermissionChoice permission={permission} setPermission={setPermission} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleCreateOpenChange(false)}>
                {formatMessage("common.done")}
              </Button>
              <Button type="button" loading={createLoading} disabled={!name.trim()} onClick={() => void submitCreate()}>
                {formatMessage("apiKeys.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">{formatMessage("apiKeys.loading")}</div>
      ) : loadError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => loadApiKeys()}>
            {formatMessage("apiKeys.retry")}
          </Button>
        </div>
      ) : activeKeys.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {formatMessage("apiKeys.empty")}
        </div>
      ) : (
        <div className="grid gap-3">
          {activeKeys.map((record) => (
            <ApiKeyRow
              key={record.id}
              record={record}
              revokeLoading={revokeLoading}
              onRevoke={(id) => void submitRevoke(id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
