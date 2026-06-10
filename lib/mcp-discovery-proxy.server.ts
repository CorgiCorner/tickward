import "server-only"

import { getMcpRemoteUrl } from "@/lib/mcp-config.server"

function getMcpOrigin(): string | null {
  const remote = getMcpRemoteUrl()
  if (!remote) return null

  try {
    return new URL(remote).origin
  } catch {
    return null
  }
}

// Mirror the remote MCP server's discovery documents under the apex domain so
// agents that start from the website root can find the OAuth and MCP Server
// Card metadata without first resolving the MCP host (e.g. via the DNS-AID
// record). By default the documents are served verbatim from the MCP origin,
// so their issuer/resource identifiers intentionally remain the MCP origin;
// routes that must present apex-scoped identifiers (RFC 9728 protected
// resource metadata) can pass `transformJson` to rewrite the parsed document.
// When no MCP remote is configured the endpoints simply report 404, so
// self-hosted deployments without a remote MCP server advertise nothing.
export async function proxyMcpDiscovery(
  path: string,
  options?: { transformJson?: (document: Record<string, unknown>) => Record<string, unknown> },
): Promise<Response> {
  const origin = getMcpOrigin()
  if (!origin) {
    return new Response("Not Found", { status: 404 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${origin}${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
  } catch {
    return new Response("Bad Gateway", { status: 502 })
  }

  if (!upstream.ok) {
    return new Response("Not Found", { status: 404 })
  }

  let body = await upstream.text()
  if (options?.transformJson) {
    try {
      const document: unknown = JSON.parse(body)
      if (document && typeof document === "object" && !Array.isArray(document)) {
        body = JSON.stringify(options.transformJson(document as Record<string, unknown>))
      }
    } catch {
      // Leave non-JSON bodies untouched; the upstream document is authoritative.
    }
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}
