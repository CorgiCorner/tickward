import { getDocsPageHref } from "@/lib/docs-config"
import { getMcpRemoteUrl } from "@/lib/mcp-config.server"
import { getSiteOrigin } from "@/lib/site-config"

export const runtime = "nodejs"

function absoluteDocs(siteOrigin: string, path: string) {
  const href = getDocsPageHref(path)
  return href.startsWith("http") ? href : `${siteOrigin}${href}`
}

// Agent registration steps mirroring the `agent_auth` block published in the
// MCP server's OAuth authorization server metadata: anonymous registration via
// dynamic client registration, then a human claims the access at /authorize.
function buildAgentRegistrationSection(mcpRemoteUrl: string | null): string[] {
  if (!mcpRemoteUrl) return []

  let mcpOrigin: string
  try {
    mcpOrigin = new URL(mcpRemoteUrl).origin
  } catch {
    return []
  }

  return [
    "### Agent registration",
    "",
    "Agents register anonymously; no user identity assertion is required up",
    "front. A human claims the registration by approving the OAuth consent.",
    "",
    `1. Register an OAuth client (RFC 7591): \`POST ${mcpOrigin}/oauth/register\``,
    "   with your client metadata. The response contains your client",
    "   credentials.",
    `2. Claim: send the user to \`${mcpOrigin}/authorize\` (authorization code +`,
    "   PKCE). They sign in, pick the scopes the connection should get, and",
    "   approve it.",
    `3. Exchange the code at \`${mcpOrigin}/oauth/token\` for scoped access and`,
    "   refresh tokens, then call the MCP endpoint with the bearer token.",
    "",
    "Discovery metadata, including the `agent_auth` block describing this",
    `flow, is published at \`${mcpOrigin}/.well-known/oauth-authorization-server\`.`,
    "Users can revoke a connection at any time in Settings -> MCP.",
    "",
  ]
}

// Agent-facing authentication guide served at /auth.md so agents can discover
// how to authenticate before calling the API or connecting over MCP.
function buildAuthMarkdown() {
  const siteOrigin = getSiteOrigin()
  const mcpRemoteUrl = getMcpRemoteUrl()

  const lines = [
    "# auth.md",
    "",
    "## Authenticating with tickward",
    "",
    "tickward exposes a versioned REST API and an optional remote MCP server.",
    "Both let agents manage countdown projects, timers, spaces, and share links.",
    "",
    "## REST API",
    "",
    `- Base URL: \`${siteOrigin}/api/v1\``,
    "- Scheme: HTTP Bearer token.",
    "- Header: `Authorization: Bearer tw_your_api_key`",
    "- Create keys in tickward Settings -> API keys. Read-only keys can inspect",
    "  resources; full-access keys can also create, update, and delete them.",
    `- Machine-readable contract: \`${siteOrigin}/openapi.json\``,
    `- API catalog: \`${siteOrigin}/.well-known/api-catalog\``,
    `- Guide: ${absoluteDocs(siteOrigin, "/guides/api-quickstart")}`,
    "",
    "## MCP (Model Context Protocol)",
    "",
    "tickward offers a remote MCP server for agent workflows. Connect an MCP",
    "client to it and authorize with OAuth; the client discovers the OAuth",
    "endpoints from the MCP server's `/.well-known/oauth-protected-resource`",
    "metadata, then registers and obtains a scoped access token.",
    "",
    ...(mcpRemoteUrl ? [`- MCP endpoint: \`${mcpRemoteUrl}\``, ""] : []),
    "- Access is scoped per connection (projects, timers, spaces, and shares;",
    "  read or write) and can be reviewed or revoked in Settings -> MCP.",
    `- Guide: ${absoluteDocs(siteOrigin, "/guides/mcp")}`,
    "",
    ...buildAgentRegistrationSection(mcpRemoteUrl),
    "## Conventions",
    "",
    "- Prefer read-only credentials for questions; confirm before destructive changes.",
    "- Send an `Idempotency-Key` header on writes that may be retried.",
    '- Errors use `{ "error": { "type": "...", "message": "..." } }`.',
    "",
  ]

  return lines.join("\n")
}

export function GET() {
  return new Response(buildAuthMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}
