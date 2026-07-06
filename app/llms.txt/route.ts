import { appExtensions } from "@/lib/app-extensions"
import { getDocsHref } from "@/lib/docs-config"
import { getSiteOrigin } from "@/lib/site-config"

export const runtime = "nodejs"

function absoluteUrl(siteOrigin: string, href: string) {
  return href.startsWith("http") ? href : `${siteOrigin}${href}`
}

function buildLlmsText() {
  const siteOrigin = getSiteOrigin()
  const docs = absoluteUrl(siteOrigin, getDocsHref())
  // Marketing surfaces (use cases, curated calendars) are contributed by the
  // app extensions, so the list only advertises URLs this deployment serves.
  const marketingLinks = appExtensions.llmsMarketingLinks?.() ?? []

  return [
    "# tickward",
    "",
    "tickward is an open-source countdown timer app for tracking dates, deadlines, public share links, embeds, and API-driven timer workflows.",
    "",
    "## Key URLs",
    "",
    `- Home: ${siteOrigin}/`,
    ...marketingLinks.map((link) => `- ${link.label}: ${absoluteUrl(siteOrigin, link.href)}`),
    `- Documentation: ${docs}`,
    `- Press: ${siteOrigin}/en/press`,
    `- OpenAPI: ${siteOrigin}/openapi.json`,
    "",
    "## Agent Guidance",
    "",
    "- Use the OpenAPI document and docs for REST API details before calling endpoints.",
    "- Use locale-prefixed marketing URLs such as /en/press, /pl/press, and /it/press; the bare homepage is the default English home page.",
    "- Treat public share and embed URLs as read-only visitor surfaces unless the API documentation says otherwise.",
    "- Do not infer account data from public pages; signed-in project access requires the documented authentication flow.",
    "",
  ].join("\n")
}

export async function GET() {
  return new Response(buildLlmsText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}
