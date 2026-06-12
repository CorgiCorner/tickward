import type { Metadata } from "next"

import { DemoProjectLoader } from "@/components/demo-project-loader"
import { formatMessage } from "@/lib/i18n/messages"
import { noIndexRobots } from "@/lib/seo-metadata"
import { resolveRouteLocale } from "@/lib/i18n/route-locale"

export async function generateMetadata(props: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = await resolveRouteLocale(props.params)
  return {
    title: formatMessage("demo.title", {}, locale),
    description: formatMessage("demo.description", {}, locale),
    robots: noIndexRobots,
  }
}

export default function DemoPage() {
  return <DemoProjectLoader />
}
