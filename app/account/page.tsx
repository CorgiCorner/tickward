import type { Metadata } from "next"
import { formatMessage } from "@/lib/i18n/messages"
import { noIndexRobots } from "@/lib/seo-metadata"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: formatMessage("auth.accountSettings"),
  robots: noIndexRobots,
}

export default function AccountRedirectPage() {
  redirect("/settings")
}
