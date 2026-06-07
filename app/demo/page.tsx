import type { Metadata } from "next"

import { DemoProjectLoader } from "@/components/demo-project-loader"
import { formatMessage } from "@/lib/i18n/messages"
import { noIndexRobots } from "@/lib/seo-metadata"

export const metadata: Metadata = {
  title: formatMessage("demo.title"),
  description: formatMessage("demo.description"),
  robots: noIndexRobots,
}

export default function DemoPage() {
  return <DemoProjectLoader />
}
