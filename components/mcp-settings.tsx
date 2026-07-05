"use client"

import { BookOpenIcon, BotIcon, CopyIcon, KeyRoundIcon, ServerIcon, Trash2Icon } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmActionButton } from "@/components/confirm-action-button"
import { SettingsDateMetadata } from "@/components/settings-metadata"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiUnavailableErrorMessage, readApiJson } from "@/lib/client-api"
import { formatMessage } from "@/lib/i18n/messages"
import { MCP_OAUTH_SCOPES, type McpConnectionPublicRecord, type McpOAuthScope } from "@/lib/mcp-oauth"

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

function McpConnectionRow(
  props: Readonly<{
    connection: McpConnectionPublicRecord
    onRevoke: (id: string) => void
    revokeLoading: string | null
  }>,
) {
  const revoked = Boolean(props.connection.revoked_at)
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-sm font-medium">{props.connection.client_name ?? props.connection.name}</div>
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              {mcpConnectionAccessLabel(props.connection.scopes)}
            </span>
            {revoked ? (
              <span className="rounded-full border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive">
                {formatMessage("apiKeys.revoked")}
              </span>
            ) : null}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {props.connection.key_prefix}...{props.connection.key_last4}
          </div>
        </div>
        <div className="shrink-0">
          <ConfirmActionButton
            actionLabel={formatMessage("mcp.connectionRevokeAction")}
            confirmAction={() => props.onRevoke(props.connection.id)}
            description={formatMessage("mcp.connectionRevokeConfirmDescription")}
            icon={<Trash2Icon className="size-4" />}
            loading={props.revokeLoading === props.connection.id}
            disabled={revoked}
            title={formatMessage("mcp.connectionRevokeConfirmTitle")}
          >
            {formatMessage("mcp.connectionRevokeConnection")}
          </ConfirmActionButton>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {props.connection.scopes.map((scope) => (
          <span key={scope} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatScope(scope)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <SettingsDateMetadata label={formatMessage("apiKeys.createdLabel")} value={props.connection.created_at} />
        <SettingsDateMetadata label={formatMessage("apiKeys.lastUsedLabel")} value={props.connection.last_used_at} />
      </div>
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
  } else if (connections.length > 0) {
    connectionsContent = (
      <div className="grid gap-2">
        {connections.map((connection) => (
          <McpConnectionRow
            key={connection.id}
            connection={connection}
            revokeLoading={revokeLoading}
            onRevoke={(id) => void revokeConnection(id)}
          />
        ))}
      </div>
    )
  } else {
    connectionsContent = (
      <div className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
        {formatMessage("mcp.connectionsEmpty")}
      </div>
    )
  }

  return (
    <section id="mcp" className="grid scroll-mt-6 gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">{formatMessage("mcp.title")}</h2>
          <p className="text-sm text-muted-foreground">{formatMessage("mcp.description")}</p>
        </div>
        {props.docsHref ? (
          <Button variant="outline" size="sm" asChild className="w-fit">
            <a href={props.docsHref} target="_blank" rel="noreferrer">
              <BookOpenIcon className="size-4" />
              {formatMessage("mcp.docs")}
            </a>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 rounded-lg bg-muted/30 p-3">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground">
            <ServerIcon className="size-4" />
          </div>
          <div className="grid min-w-0 flex-1 gap-2">
            <div className="grid gap-1">
              <div className="text-sm font-medium">{formatMessage("mcp.remoteTitle")}</div>
              <p className="text-xs text-muted-foreground">{formatMessage("mcp.remoteDescription")}</p>
            </div>
            {props.remoteUrl ? (
              <div className="flex gap-2">
                <Input value={props.remoteUrl} readOnly className="min-w-0 font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={formatMessage("mcp.copyRemoteUrl")}
                  onClick={() => void copyToClipboard(props.remoteUrl ?? "")}
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
                {formatMessage("mcp.remoteNotConfigured")}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg bg-muted/30 p-3">
        <div className="grid gap-1">
          <div className="text-sm font-medium">{formatMessage("mcp.connectionsTitle")}</div>
          <p className="text-xs text-muted-foreground">{formatMessage("mcp.connectionsDescription")}</p>
        </div>
        {connectionsContent}
      </div>

      <div className="grid gap-3 rounded-lg bg-muted/30 p-3">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground">
            <BotIcon className="size-4" />
          </div>
          <div className="grid min-w-0 flex-1 gap-2">
            <div className="grid gap-1">
              <div className="text-sm font-medium">{formatMessage("mcp.localAgentsTitle")}</div>
              <p className="text-xs text-muted-foreground">{formatMessage("mcp.localAgentsDescription")}</p>
            </div>
            <div className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs text-muted-foreground">
              <KeyRoundIcon className="mt-0.5 size-4 shrink-0" />
              <p>{formatMessage("mcp.apiKeysHint")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
