import { BotIcon, CheckIcon, ShieldCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatMessage } from "@/lib/i18n/messages"
import type { McpOAuthScope } from "@/lib/mcp-oauth"

type ScopeResource = "projects" | "timers" | "spaces" | "shares" | "webhooks"
type ScopeAction = "read" | "write"

type ScopeSummary = {
  action: "read" | "write"
  description: string
  title: string
}

const RESOURCE_ORDER: ScopeResource[] = ["projects", "timers", "spaces", "shares", "webhooks"]

export function McpAuthorizationCard(
  props: Readonly<{
    clientName: string
    handoff: string
    mcpOrigin: string
    scopes: McpOAuthScope[]
    userEmail?: string
  }>,
) {
  const scopeRows = summarizeScopes(props.scopes)
  const signedInLabel = props.userEmail
    ? formatMessage("mcp.authorize.signedInAs", { email: props.userEmail })
    : formatMessage("mcp.authorize.signedIn")

  return (
    <section className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs">
      <div className="grid gap-4 p-4 sm:gap-5 sm:p-6">
        <div className="grid gap-3 sm:flex sm:items-start">
          <div className="flex items-center gap-3 sm:contents">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground sm:size-10">
              <BotIcon className="size-4 sm:size-5" />
            </div>
            <div className="text-xs font-medium text-muted-foreground sm:hidden">
              {formatMessage("mcp.authorize.kicker")}
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <div className="hidden text-xs font-medium text-muted-foreground sm:block">
              {formatMessage("mcp.authorize.kicker")}
            </div>
            <h1 className="text-xl font-semibold tracking-normal sm:text-2xl">
              {formatMessage("mcp.authorize.heading", { client: props.clientName })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatMessage("mcp.authorize.clientDescription", { client: props.clientName })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground sm:text-sm">
          <ShieldCheckIcon className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{signedInLabel}</span>
        </div>

        <div className="grid gap-3">
          <div>
            <h2 className="text-sm font-medium">{formatMessage("mcp.authorize.scopesTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{formatMessage("mcp.authorize.scopesDescription")}</p>
          </div>
          <ul className="divide-y rounded-md border">
            {scopeRows.map((scope) => (
              <li key={scope.title} className="flex items-start gap-2.5 px-2.5 py-3 sm:gap-3 sm:px-3">
                <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:size-5">
                  <CheckIcon className="size-3 sm:size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{scope.title}</span>
                    <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:px-2 sm:text-[11px]">
                      {formatMessage(
                        scope.action === "write" ? "mcp.authorize.access.write" : "mcp.authorize.access.read",
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{scope.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <form action="/api/mcp/oauth/grants" method="post" className="grid gap-3">
          <input type="hidden" name="handoff" value={props.handoff} />
          <input type="hidden" name="mcp_origin" value={props.mcpOrigin} />
          <Button type="submit" className="w-full">
            {formatMessage("mcp.authorize.approve")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{formatMessage("mcp.authorize.footer")}</p>
        </form>
      </div>
    </section>
  )
}

export function InvalidMcpAuthorization() {
  return (
    <section className="grid gap-3 rounded-lg border bg-card p-5 text-card-foreground shadow-xs sm:p-6">
      <h1 className="text-xl font-semibold tracking-normal">{formatMessage("mcp.authorize.unavailableTitle")}</h1>
      <p className="text-sm text-muted-foreground">{formatMessage("mcp.authorize.unavailableDescription")}</p>
    </section>
  )
}

function summarizeScopes(scopes: readonly McpOAuthScope[]): ScopeSummary[] {
  return RESOURCE_ORDER.flatMap((resource) => {
    const actions = scopeActions(scopes, resource)
    if (actions.size === 0) return []

    const action = actions.has("write") ? "write" : "read"
    return {
      action,
      description: formatMessage(
        action === "write" ? scopeWriteDescriptionKey(resource) : scopeReadDescriptionKey(resource),
      ),
      title: formatMessage(scopeTitleKey(resource)),
    }
  })
}

function scopeActions(scopes: readonly McpOAuthScope[], resource: ScopeResource) {
  const actions = new Set<ScopeAction>()
  for (const scope of scopes) {
    const [scopeResource, scopeAction] = scope.split(":")
    if (scopeResource === resource && (scopeAction === "read" || scopeAction === "write")) {
      actions.add(scopeAction)
    }
  }
  return actions
}

function scopeTitleKey(resource: ScopeResource) {
  switch (resource) {
    case "projects":
      return "mcp.authorize.scope.projects.title"
    case "timers":
      return "mcp.authorize.scope.timers.title"
    case "spaces":
      return "mcp.authorize.scope.spaces.title"
    case "shares":
      return "mcp.authorize.scope.shares.title"
    case "webhooks":
      return "mcp.authorize.scope.webhooks.title"
  }
}

function scopeReadDescriptionKey(resource: ScopeResource) {
  switch (resource) {
    case "projects":
      return "mcp.authorize.scope.projects.readDescription"
    case "timers":
      return "mcp.authorize.scope.timers.readDescription"
    case "spaces":
      return "mcp.authorize.scope.spaces.readDescription"
    case "shares":
      return "mcp.authorize.scope.shares.readDescription"
    case "webhooks":
      return "mcp.authorize.scope.webhooks.readDescription"
  }
}

function scopeWriteDescriptionKey(resource: ScopeResource) {
  switch (resource) {
    case "projects":
      return "mcp.authorize.scope.projects.writeDescription"
    case "timers":
      return "mcp.authorize.scope.timers.writeDescription"
    case "spaces":
      return "mcp.authorize.scope.spaces.writeDescription"
    case "shares":
      return "mcp.authorize.scope.shares.writeDescription"
    case "webhooks":
      return "mcp.authorize.scope.webhooks.writeDescription"
  }
}
