import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
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

export const metadata: Metadata = {
  title: formatMessage("mcp.authorize.title"),
  description: formatMessage("mcp.authorize.description"),
  robots: noIndexRobots,
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

function scopeLabel(scope: string) {
  return scope.replace(":", " ")
}

function InvalidMcpAuthorization() {
  return (
    <section className="grid gap-3 rounded-lg border p-4">
      <h1 className="text-xl font-semibold tracking-normal">{formatMessage("mcp.authorize.unavailableTitle")}</h1>
      <p className="text-sm text-muted-foreground">{formatMessage("mcp.authorize.unavailableDescription")}</p>
    </section>
  )
}

export default async function McpAuthorizePage(props: Readonly<{ searchParams: Promise<McpAuthorizeSearchParams> }>) {
  const searchParams = await props.searchParams
  const handoff = normalizeMcpHandoffId(searchParams.handoff)
  const origin = searchParams.mcp_origin ?? ""
  const url = await currentRequestUrl()
  if (handoff) url.searchParams.set("handoff", handoff)
  if (origin) url.searchParams.set("mcp_origin", origin)

  await requireSignedInMcpUser(`${url.pathname}${url.search}`)

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
        <Header timerCount={timers.length} />
        <main className="mx-auto grid w-full max-w-[520px] gap-6 px-4 py-8">
          {authorization ? (
            <section className="grid gap-5 rounded-lg border p-4">
              <div className="grid gap-1">
                <h1 className="text-xl font-semibold tracking-normal">{formatMessage("mcp.authorize.title")}</h1>
                <p className="text-sm text-muted-foreground">
                  {formatMessage("mcp.authorize.clientDescription", { client: authorization.clientName })}
                </p>
              </div>
              <div className="grid gap-2">
                <div className="text-sm font-medium">{formatMessage("mcp.authorize.scopesTitle")}</div>
                <ul className="grid gap-2">
                  {authorization.scopes.map((scope) => (
                    <li key={scope} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      {scopeLabel(scope)}
                    </li>
                  ))}
                </ul>
              </div>
              <form action="/api/mcp/oauth/grants" method="post" className="grid gap-3">
                <input type="hidden" name="handoff" value={authorization.handoff} />
                <input type="hidden" name="mcp_origin" value={authorization.mcpOrigin} />
                <Button type="submit">{formatMessage("mcp.authorize.approve")}</Button>
                <p className="text-xs text-muted-foreground">{formatMessage("mcp.authorize.footer")}</p>
              </form>
            </section>
          ) : (
            <InvalidMcpAuthorization />
          )}
        </main>
        <Footer docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
      </div>
    </TimerStoreProvider>
  )
}
