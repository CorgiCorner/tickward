import Link from "next/link"
import { ArrowLeftIcon, Clock3Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatMessage } from "@/lib/i18n/messages"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
          <Clock3Icon className="size-6" />
        </div>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {formatMessage("notFound.eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-foreground">
          {formatMessage("notFound.title")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{formatMessage("notFound.description")}</p>
        <Button asChild className="mt-7">
          <Link href="/">
            <ArrowLeftIcon className="size-4" />
            {formatMessage("notFound.action")}
          </Link>
        </Button>
      </section>
    </main>
  )
}
