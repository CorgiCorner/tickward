import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { FooterFull } from "@/components/footer-full"
import { Header } from "@/components/header"
import { InvalidMcpAuthorization, McpAuthorizationCard } from "@/components/mcp-authorization-card"
import { readRestoreKeyCookie, readSpacesCookie, readTimersCookie } from "@/lib/cookies.server"
import type { UserActor } from "@/lib/contracts"
import { getCurrentActor } from "@/lib/actor.server"
import { getDocsHref } from "@/lib/docs-config"
import { formatMessage } from "@/lib/i18n/messages"
import { normalizeMcpHandoffId, readMcpAuthorizationHandoff } from "@/lib/mcp-authorization-handoff.server"
import { getPublicReleaseTag } from "@/lib/release.server"
import { noIndexRobots } from "@/lib/seo-metadata"
import { TimerStoreProvider } from "@/lib/store"
import type { Space, Timer } from "@/lib/types"
import { isSpaceArray, isTimerArray } from "@/lib/validate"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  return {
    title: formatMessage("mcp.authorize.title", {}, locale),
    description: formatMessage("mcp.authorize.description", {}, locale),
    robots: noIndexRobots,
  }
}

type McpAuthorizeSearchParams = {
  handoff?: string
  mcp_origin?: string
}

async function currentRequestUrl() {
  const incomingHeaders = await headers()
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"
  return new URL(`${protocol}://${host}/mcp/authorize`)
}

async function requireSignedInMcpUser(nextPath: string): Promise<UserActor> {
  const incomingHeaders = await headers()
  const requestHeaders = new Headers(incomingHeaders)
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https"
  const host = incomingHeaders.get("host") ?? "localhost"

  try {
    const actor = await getCurrentActor({
      request: new Request(`${protocol}://${host}${nextPath}`, { headers: requestHeaders }),
    })
    if (actor.kind === "user") return actor
  } catch {}

  redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`)
}

export default async function McpAuthorizePage(props: Readonly<{ searchParams: Promise<McpAuthorizeSearchParams> }>) {
  const searchParams = await props.searchParams
  const handoff = normalizeMcpHandoffId(searchParams.handoff)
  const origin = searchParams.mcp_origin ?? ""
  const url = await currentRequestUrl()
  if (handoff) url.searchParams.set("handoff", handoff)
  if (origin) url.searchParams.set("mcp_origin", origin)

  const actor = await requireSignedInMcpUser(`${url.pathname}${url.search}`)

  const authorization = handoff
    ? await readMcpAuthorizationHandoff({ handoff, mcpOrigin: origin }).catch(() => null)
    : null

  const rawTimers = await readTimersCookie<unknown>()
  const timers: Timer[] = isTimerArray(rawTimers) ? rawTimers : []
  const rawSpaces = await readSpacesCookie<unknown>()
  const spaces: Space[] = isSpaceArray(rawSpaces) ? rawSpaces : []
  const restoreKey = await readRestoreKeyCookie()

  return (
    <TimerStoreProvider initialState={{ timers, spaces, restoreKey }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header />
        <main className="mx-auto grid w-full max-w-[560px] gap-6 px-4 py-8 sm:py-10">
          {authorization ? (
            <McpAuthorizationCard
              clientName={authorization.clientName}
              handoff={authorization.handoff}
              mcpOrigin={authorization.mcpOrigin}
              scopes={authorization.scopes}
              userEmail={actor.user.email}
            />
          ) : (
            <InvalidMcpAuthorization />
          )}
        </main>
        <FooterFull docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
