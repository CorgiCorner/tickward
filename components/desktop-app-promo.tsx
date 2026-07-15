import Image from "next/image"
import { ArrowDownToLine, BatteryMedium, TimerIcon, Wifi } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getLatestDesktopRelease } from "@/lib/desktop-release"
import { formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"

function DesktopPreview({ caption, timerLabel }: Readonly<{ caption: string; timerLabel: string }>) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[230px]">
      <div className="absolute -inset-8 rounded-full bg-primary/[0.05] blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border bg-background/95 p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/75 pb-2 text-muted-foreground">
          <span className="flex gap-1">
            <span className="size-1.5 rounded-full bg-muted-foreground/25" />
            <span className="size-1.5 rounded-full bg-muted-foreground/25" />
            <span className="size-1.5 rounded-full bg-muted-foreground/25" />
          </span>
          <span className="flex items-center gap-2">
            <Wifi className="size-3" />
            <BatteryMedium className="size-3.5" />
            <span className="font-mono text-[10px]">09:41</span>
          </span>
        </div>
        <div className="mt-3 rounded-xl border bg-primary/[0.025] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                <TimerIcon className="size-3.5" />
              </span>
              <span className="truncate">{timerLabel}</span>
            </span>
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">12d 04:32</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[62%] rounded-full bg-primary" />
          </div>
        </div>
        <p className="mt-2.5 text-center text-[11px] text-muted-foreground">{caption}</p>
      </div>
    </div>
  )
}

export async function DesktopAppPromo(props: Readonly<{ locale: Locale }>) {
  const release = await getLatestDesktopRelease()
  const downloadHref = release?.dmgUrl ?? localeHref(props.locale, "/download")

  return (
    <section aria-labelledby="desktop-app-promo-title">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-6">
        <div className="relative overflow-hidden rounded-xl border border-border bg-primary/[0.025] p-5 sm:p-6">
          <div className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="relative grid gap-6 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Image
                  src="/desktop/tickward-desktop-256.png"
                  alt={formatMessage("download.iconAlt", {}, props.locale)}
                  width={48}
                  height={48}
                  priority
                  className="rounded-xl border shadow-xs"
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">macOS</p>
                  <h2 id="desktop-app-promo-title" className="mt-0.5 text-lg font-semibold tracking-tight">
                    {formatMessage("download.title", {}, props.locale)}
                  </h2>
                </div>
              </div>
              <p className="mt-3 max-w-[380px] text-sm leading-6 text-muted-foreground">
                {formatMessage("download.tagline", {}, props.locale)}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button asChild className="w-full sm:w-auto">
                  <a href={downloadHref} download={release ? true : undefined}>
                    <ArrowDownToLine className="size-4" />
                    {formatMessage("download.cta", {}, props.locale)}
                  </a>
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  {release
                    ? `v${release.version} · Apple silicon`
                    : formatMessage("download.requirements", {}, props.locale)}
                </p>
              </div>
            </div>
            <DesktopPreview
              caption={formatMessage("download.preview.caption", {}, props.locale)}
              timerLabel={formatMessage("home.empty.example.deadline", {}, props.locale)}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
