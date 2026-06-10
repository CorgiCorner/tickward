import { getDocsHref } from "@/lib/docs-config"
import { formatMessage } from "@/lib/i18n/messages"
import { getSiteOrigin } from "@/lib/site-config"

export const runtime = "nodejs"

// Markdown representation of the home page, served directly at /home.md and via
// content negotiation on `/` (Accept: text/markdown) so agents can read a
// compact, link-rich summary instead of parsing the rendered HTML.
function buildHomeMarkdown() {
  const siteOrigin = getSiteOrigin()
  const docsHref = getDocsHref()
  const docs = docsHref.startsWith("http") ? docsHref : `${siteOrigin}${docsHref}`

  return [
    `# ${formatMessage("app.manifest.name")}`,
    "",
    `> ${formatMessage("app.og.description")}`,
    "",
    formatMessage("app.description"),
    "",
    "## Programmatic & agent access",
    "",
    `- App: ${siteOrigin}`,
    `- REST API base: ${siteOrigin}/api/v1`,
    `- OpenAPI: ${siteOrigin}/openapi.json`,
    `- API catalog: ${siteOrigin}/.well-known/api-catalog`,
    `- Agent skill: ${siteOrigin}/skill.md`,
    `- Authentication: ${siteOrigin}/auth.md`,
    `- LLM text: ${siteOrigin}/llms.txt`,
    `- Docs: ${docs}`,
    "",
    "## Capabilities",
    "",
    "- Manage countdown projects, timers, spaces, and public share links over the REST API.",
    "- Connect an MCP client for agent workflows.",
    "",
  ].join("\n")
}

export function GET() {
  return new Response(buildHomeMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
      Vary: "Accept",
    },
  })
}
