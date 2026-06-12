import type { Metadata } from "next"
import { formatMessage } from "@/lib/i18n/messages"
import { noIndexRobots } from "@/lib/seo-metadata"
import { redirect } from "next/navigation"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  return {
    title: formatMessage("auth.accountSettings", {}, locale),
    robots: noIndexRobots,
  }
}

export default function AccountRedirectPage() {
  redirect("/settings")
}
