"use client"

import { BookOpenIcon, ChevronDownIcon, CopyIcon, EllipsisIcon, Trash2Icon } from "lucide-react"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { formatSettingsDate } from "@/components/settings-metadata"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { apiUnavailableErrorMessage, readApiJson } from "@/lib/client-api"
import { formatMessage } from "@/lib/i18n/messages"
import { MCP_OAUTH_SCOPES, type McpConnectionPublicRecord, type McpOAuthScope } from "@/lib/mcp-oauth"

type McpConnectionGroup =
  | { type: "single"; connection: McpConnectionPublicRecord }
  | { type: "group"; name: string; connections: McpConnectionPublicRecord[] }

async function fetchMcpConnections() {
  const res = await fetch("/api/account/mcp-connections", { cache: "no-store" })
  const data = await readApiJson<{ data?: McpConnectionPublicRecord[] }>(
    res,
    formatMessage("mcp.connectionsLoadFailed"),
  )
  return Array.isArray(data.data) ? data.data : []
}

async function revokeMcpConnection(id: string) {
  const res = await fetch(`/api/account/mcp-connections/${encodeURIComponent(id)}`, { method: "DELETE" })
  await readApiJson<unknown>(res, formatMessage("mcp.connectionRevokeFailed"))
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(formatMessage("mcp.copied"))
  } catch {
    toast.error(formatMessage("mcp.copyFailed"))
  }
}

function mcpConnectionsLoadErrorMessage(error: unknown) {
  return apiUnavailableErrorMessage(
    error,
    formatMessage("mcp.connectionsUnavailable"),
    formatMessage("mcp.connectionsLoadFailed"),
  )
}

function mcpConnectionAccessLabel(scopes: readonly McpOAuthScope[]) {
  const requestedScopes = new Set(scopes)
  const hasWriteScope = scopes.some((scope) => scope.endsWith(":write"))
  if (!hasWriteScope) return formatMessage("mcp.connectionAccess.readOnly")

  const hasEveryScope = MCP_OAUTH_SCOPES.every((scope) => requestedScopes.has(scope))
  return hasEveryScope ? formatMessage("mcp.connectionAccess.full") : formatMessage("mcp.connectionAccess.scopedWrite")
}

function formatScope(scope: McpOAuthScope) {
  const [resource, action] = scope.split(":")
  return `${resource} ${action}`
}

function mcpConnectionKeyLabel(connection: McpConnectionPublicRecord) {
  return `${connection.key_prefix}…${connection.key_last4}`
}

function lastUsedText(value: string | null) {
  return value ? formatMessage("mcp.lastUsed", { date: formatSettingsDate(value) }) : formatMessage("mcp.neverUsed")
}

function groupMcpConnections(connections: McpConnectionPublicRecord[]): McpConnectionGroup[] {
  const byName = new Map<string, McpConnectionPublicRecord[]>()
  for (const connection of connections) {
    const group = byName.get(connection.name) ?? []
    group.push(connection)
    byName.set(connection.name, group)
  }

  const groups: McpConnectionGroup[] = []
  for (const [name, group] of byName.entries()) {
    if (group.length > 1) {
      groups.push({ type: "group", name, connections: group })
    } else {
      groups.push({ type: "single", connection: group[0]! })
    }
  }
  return groups
}

function McpConnectionMenu(
  props: Readonly<{
    connection: McpConnectionPublicRecord
    onRevoke: (id: string) => void
    revokeLoading: string | null
  }>,
) {
  const [revokeOpen, setRevokeOpen] = useState(false)
  const revoked = Boolean(props.connection.revoked_at)

  return (
    <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={formatMessage("mcp.connectionActions")}
            className="size-7 text-muted-foreground/60 hover:text-foreground"
            loading={props.revokeLoading === props.connection.id}
            disabled={revoked}
          >
            <EllipsisIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setRevokeOpen(true)}>
            <Trash2Icon className="mr-2 size-4" />
            {formatMessage("mcp.connectionRevokeConnection")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{formatMessage("mcp.connectionRevokeConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{formatMessage("mcp.connectionRevokeConfirmDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{formatMessage("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => props.onRevoke(props.connection.id)}>
            {formatMessage("mcp.connectionRevokeAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function McpSingleConnectionRow(
  props: Readonly<{
    connection: McpConnectionPublicRecord
    onRevoke: (id: string) => void
    open: boolean
    revokeLoading: string | null
    toggleOpen: () => void
  }>,
) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{props.connection.name}</span>
            <span className="rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
              {mcpConnectionAccessLabel(props.connection.scopes)}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {formatMessage("mcp.keyUsage", {
              date: lastUsedText(props.connection.last_used_at),
              key: mcpConnectionKeyLabel(props.connection),
            })}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={formatMessage("mcp.expandConnection")}
          className="size-7 text-muted-foreground/60 hover:text-foreground"
          onClick={props.toggleOpen}
        >
          <ChevronDownIcon
            className={props.open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"}
          />
        </Button>
        <McpConnectionMenu
          connection={props.connection}
          revokeLoading={props.revokeLoading}
          onRevoke={props.onRevoke}
        />
      </div>
      {props.open ? (
        <div className="pt-2.5">
          <div className="flex flex-wrap gap-1">
            {props.connection.scopes.map((scope) => (
              <span key={scope} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {formatScope(scope)}
              </span>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {props.connection.last_used_at
              ? formatMessage("mcp.connectionDetailDates", {
                  created: formatSettingsDate(props.connection.created_at),
                  lastUsed: formatSettingsDate(props.connection.last_used_at),
                })
              : formatMessage("mcp.connectionDetailNeverUsed", {
                  created: formatSettingsDate(props.connection.created_at),
                })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function McpGroupedConnectionRow(
  props: Readonly<{
    connections: McpConnectionPublicRecord[]
    name: string
    onRevoke: (id: string) => void
    open: boolean
    revokeLoading: string | null
    toggleOpen: () => void
  }>,
) {
  const neverUsedCount = props.connections.filter((connection) => connection.last_used_at === null).length
  const scopes = [...new Set(props.connections.flatMap((connection) => connection.scopes))]

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{props.name}</span>
            <span className="rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
              {mcpConnectionAccessLabel(scopes)}
            </span>
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
              {formatMessage("mcp.groupBadge", { count: props.connections.length })}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {formatMessage("mcp.groupSummary", {
              count: props.connections.length,
              neverUsed: neverUsedCount,
            })}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={formatMessage("mcp.expandConnection")}
          className="size-7 text-muted-foreground/60 hover:text-foreground"
          onClick={props.toggleOpen}
        >
          <ChevronDownIcon
            className={props.open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"}
          />
        </Button>
      </div>
      {props.open ? (
        <div className="grid gap-1.5 pt-2.5 text-[11px] text-muted-foreground">
          {props.connections.map((connection) => (
            <div key={connection.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono">{mcpConnectionKeyLabel(connection)}</span>
              <span className={connection.last_used_at ? "shrink-0" : "shrink-0 text-destructive"}>
                {lastUsedText(connection.last_used_at)}
              </span>
              <McpConnectionMenu
                connection={connection}
                revokeLoading={props.revokeLoading}
                onRevoke={props.onRevoke}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function McpSettingsPanel(
  props: Readonly<{
    initialConnections?: McpConnectionPublicRecord[]
    initialLoadError?: string | null
    docsHref?: string | null
    remoteUrl?: string | null
  }>,
) {
  const [connections, setConnections] = useState<McpConnectionPublicRecord[]>(() => props.initialConnections ?? [])
  const [loadError, setLoadError] = useState<string | null>(() => props.initialLoadError ?? null)
  const [loading, setLoading] = useState(false)
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null)
  const [bulkRevokeLoading, setBulkRevokeLoading] = useState(false)
  const [openConnections, setOpenConnections] = useState<Set<string>>(() => new Set())
  const activeConnections = useMemo(() => connections.filter((connection) => !connection.revoked_at), [connections])
  const unusedConnections = useMemo(
    () => activeConnections.filter((connection) => connection.last_used_at === null),
    [activeConnections],
  )
  const groupedConnections = useMemo(() => groupMcpConnections(activeConnections), [activeConnections])

  async function refreshConnections() {
    setLoading(true)
    try {
      setConnections(await fetchMcpConnections())
      setLoadError(null)
    } catch (error) {
      setLoadError(mcpConnectionsLoadErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function revokeConnection(id: string) {
    setRevokeLoading(id)
    try {
      await revokeMcpConnection(id)
      setConnections((current) =>
        current.map((connection) =>
          connection.id === id ? { ...connection, revoked_at: new Date().toISOString() } : connection,
        ),
      )
      toast.success(formatMessage("mcp.connectionRevoked"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("mcp.connectionRevokeFailed"))
    } finally {
      setRevokeLoading(null)
    }
  }

  async function revokeUnusedConnections() {
    if (unusedConnections.length === 0) {
      toast.success(formatMessage("mcp.revokeUnusedNone"))
      return
    }

    setBulkRevokeLoading(true)
    try {
      const ids = unusedConnections.map((connection) => connection.id)
      await Promise.all(ids.map((id) => revokeMcpConnection(id)))
      const revokedAt = new Date().toISOString()
      setConnections((current) =>
        current.map((connection) =>
          ids.includes(connection.id) ? { ...connection, revoked_at: revokedAt } : connection,
        ),
      )
      toast.success(formatMessage("mcp.revokeUnusedToast"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : formatMessage("mcp.connectionRevokeFailed"))
    } finally {
      setBulkRevokeLoading(false)
    }
  }

  function toggleConnectionOpen(id: string) {
    setOpenConnections((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  let connectionsContent: ReactNode
  if (loadError) {
    connectionsContent = (
      <div className="flex flex-col gap-3 rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{loadError}</p>
        <Button type="button" variant="outline" size="sm" loading={loading} onClick={() => void refreshConnections()}>
          {formatMessage("apiKeys.retry")}
        </Button>
      </div>
    )
  } else if (groupedConnections.length > 0) {
    connectionsContent = (
      <div className="mt-2 divide-y divide-border rounded-lg border border-border">
        {groupedConnections.map((item) =>
          item.type === "single" ? (
            <McpSingleConnectionRow
              key={item.connection.id}
              connection={item.connection}
              open={openConnections.has(item.connection.id)}
              revokeLoading={revokeLoading}
              onRevoke={(id) => void revokeConnection(id)}
              toggleOpen={() => toggleConnectionOpen(item.connection.id)}
            />
          ) : (
            <McpGroupedConnectionRow
              key={item.name}
              name={item.name}
              connections={item.connections}
              open={openConnections.has(item.name)}
              revokeLoading={revokeLoading}
              onRevoke={(id) => void revokeConnection(id)}
              toggleOpen={() => toggleConnectionOpen(item.name)}
            />
          ),
        )}
      </div>
    )
  } else {
    connectionsContent = (
      <div className="mt-2 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
        {formatMessage("mcp.connectionsEmpty")}
      </div>
    )
  }

  return (
    <section id="mcp" className="grid scroll-mt-28 gap-0">
      <div className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{formatMessage("mcp.title")}</div>
          <p className="text-xs text-muted-foreground">{formatMessage("mcp.description")}</p>
        </div>
        {props.docsHref ? (
          <Button variant="ghost" size="sm" asChild className="h-8 shrink-0 text-xs text-muted-foreground">
            <a href={props.docsHref} target="_blank" rel="noreferrer">
              <BookOpenIcon className="size-3.5" />
              {formatMessage("mcp.docs")}
            </a>
          </Button>
        ) : null}
      </div>

      {props.remoteUrl ? (
        <div className="flex items-center gap-2">
          <Input
            value={props.remoteUrl}
            readOnly
            className="h-8 min-w-0 flex-1 font-mono text-xs text-muted-foreground"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={formatMessage("mcp.copyRemoteUrl")}
            onClick={() => void copyToClipboard(props.remoteUrl ?? "")}
          >
            <CopyIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
          {formatMessage("mcp.remoteNotConfigured")}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-sm font-medium">
          {formatMessage("mcp.connectionsTitle")}
          <span className="ml-1 font-mono text-xs text-muted-foreground">{activeConnections.length}</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              disabled={unusedConnections.length === 0 || bulkRevokeLoading}
            >
              {formatMessage("mcp.revokeUnused")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{formatMessage("mcp.revokeUnusedConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {formatMessage("mcp.revokeUnusedConfirmDescription", { count: unusedConnections.length })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{formatMessage("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void revokeUnusedConnections()}>
                {formatMessage("mcp.revokeUnusedAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {connectionsContent}

      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{formatMessage("mcp.localAgentsHelper")}</p>
    </section>
  )
}
