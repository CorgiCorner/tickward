import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon, Clock3Icon } from "lucide-react"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

import { Button } from "@/components/ui/button"
import { DEFAULT_LOCALE, formatMessage } from "@/lib/i18n/messages"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: formatMessage("notFound.title", {}, DEFAULT_LOCALE),
}

// Routing-level 404: paths that match no route render this standalone
// document with a real 404 status. It owns its own <html>, so it stays
// outside the [locale] tree and renders in the default locale.
export default function GlobalNotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
          <section className="w-full max-w-md text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
              <Clock3Icon className="size-6" />
            </div>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {formatMessage("notFound.eyebrow", {}, DEFAULT_LOCALE)}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-foreground">
              {formatMessage("notFound.title", {}, DEFAULT_LOCALE)}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {formatMessage("notFound.description", {}, DEFAULT_LOCALE)}
            </p>
            <Button asChild className="mt-7">
              <Link href="/">
                <ArrowLeftIcon className="size-4" />
                {formatMessage("notFound.action", {}, DEFAULT_LOCALE)}
              </Link>
            </Button>
          </section>
        </main>
      </body>
    </html>
  )
}
