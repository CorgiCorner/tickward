export const MCP_CONNECTION_TOKEN_PREFIX = "tw_mcp_"

export const MCP_OAUTH_SCOPES = [
  "projects:read",
  "projects:write",
  "timers:read",
  "timers:write",
  "spaces:read",
  "spaces:write",
  "shares:read",
  "shares:write",
] as const

export type McpOAuthScope = (typeof MCP_OAUTH_SCOPES)[number]

export type McpConnectionPublicRecord = {
  client_name: string | null
  created_at: string
  id: string
  key_last4: string
  key_prefix: string
  last_used_at: string | null
  name: string
  object: "mcp_connection"
  permission: "full_access" | "read"
  revoked_at: string | null
  scopes: McpOAuthScope[]
  updated_at: string
}

const MCP_OAUTH_SCOPE_SET = new Set<string>(MCP_OAUTH_SCOPES)

export function isMcpOAuthScope(value: unknown): value is McpOAuthScope {
  return typeof value === "string" && MCP_OAUTH_SCOPE_SET.has(value)
}

export function normalizeMcpOAuthScopes(value: unknown): McpOAuthScope[] {
  if (!Array.isArray(value)) return []
  const scopes = value.filter(isMcpOAuthScope)
  return [...new Set(scopes)]
}

export function mcpScopesNeedWriteAccess(scopes: readonly McpOAuthScope[]) {
  return scopes.some((scope) => scope.endsWith(":write"))
}

export function mcpConnectionPermission(scopes: readonly McpOAuthScope[]) {
  return mcpScopesNeedWriteAccess(scopes) ? "full_access" : "read"
}
