import type { ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

const COUNTDOWN_PARTS = ["days", "hours", "minutes", "seconds"] as const
const SPACE_CHIPS = [
  { id: "all", width: "w-16" },
  { id: "launch", width: "w-24" },
  { id: "ops", width: "w-28" },
  { id: "unassigned", width: "w-24" },
] as const
const TIMER_CARD_SKELETONS = [
  { id: "featured", pinned: true, withImage: false },
  { id: "secondary", pinned: false, withImage: true },
  { id: "tertiary", pinned: false, withImage: false },
] as const
const TIMER_CARD_BAR_CLASS = "bg-muted-foreground/10"
export const HOME_EMPTY_TIMER_EXAMPLES = [
  "home.empty.example.trip",
  "home.empty.example.deadline",
  "home.empty.example.birthday",
  "home.empty.example.newYear",
] as const

function ScreenReaderLoadingLabel(props: Readonly<{ label: string }>) {
  return <span className="sr-only">{props.label}</span>
}

function HeaderActionSkeleton(props: Readonly<{ className?: string }>) {
  return <Skeleton className={cn("h-8 shrink-0 rounded-md", props.className)} />
}

export function AppHeaderLoadingSkeleton() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-4 w-16" />
        </div>

        <div className="ml-2 min-w-0 flex-1">
          <Skeleton className="h-8 w-full rounded-md" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <HeaderActionSkeleton className="hidden w-[104px] sm:block" />
          <HeaderActionSkeleton className="w-[76px]" />
          <HeaderActionSkeleton className="hidden size-9 md:block" />
          <HeaderActionSkeleton className="size-9" />
        </div>
      </div>
    </header>
  )
}

export function QuickAddTimerLoadingSkeleton() {
  return (
    <div
      data-loading-region="quick-add"
      className="mb-4 flex min-w-0 items-center gap-1.5 rounded-[12px] border border-border bg-card py-1 pl-1.5 pr-2"
    >
      <Skeleton className="size-8 shrink-0 rounded-md" />
      <Skeleton className="h-9 min-w-0 flex-1 rounded-md" />
      <Skeleton className="hidden h-[18px] w-5 shrink-0 rounded border sm:block" />
      <Skeleton className="h-8 w-9 shrink-0 rounded-md min-[420px]:w-28" />
    </div>
  )
}

export function OrganizerBarLoadingSkeleton() {
  return (
    <section data-loading-region="organizer" className="mb-4 flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 flex-1 self-center overflow-hidden">
          <div className="flex min-w-max items-center gap-1.5">
            {SPACE_CHIPS.map((chip, index) => (
              <Skeleton
                key={chip.id}
                className={cn("h-8 shrink-0 rounded-full", chip.width, index === 0 ? "bg-primary/15" : undefined)}
              />
            ))}
          </div>
        </div>

        <Skeleton className="size-7 shrink-0 rounded-full" />
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <Skeleton className="size-8 shrink-0 rounded-md" />
      </div>
    </section>
  )
}

export function TimerCardLoadingSkeleton(
  props: Readonly<{
    className?: string
    pinned?: boolean
    withImage?: boolean
  }>,
) {
  return (
    <div data-loading-region="timer-card" className={cn("min-w-0", props.className)}>
      <div
        className={cn(
          "group relative min-w-0 w-full bg-card p-5 md:rounded-2xl md:border",
          props.pinned ? "bg-primary/[0.03] ring-1 ring-primary/10 md:border-primary/20" : "md:border-border",
        )}
      >
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 md:hidden">
          <Skeleton className={cn("size-7 rounded-full", TIMER_CARD_BAR_CLASS)} />
          <Skeleton className={cn("size-7 rounded-full", TIMER_CARD_BAR_CLASS)} />
          <Skeleton className={cn("size-7 rounded-full", TIMER_CARD_BAR_CLASS)} />
          <Skeleton className={cn("size-7 rounded-full", TIMER_CARD_BAR_CLASS)} />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {props.withImage ? <Skeleton className={cn("size-12 shrink-0 rounded-xl", TIMER_CARD_BAR_CLASS)} /> : null}
            <div className="min-w-0 pr-36 md:pr-0">
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className={cn("h-5 w-40 max-w-[50vw] rounded-md sm:w-48", TIMER_CARD_BAR_CLASS)} />
                {props.pinned ? (
                  <Skeleton className={cn("h-5 w-14 shrink-0 rounded-full", TIMER_CARD_BAR_CLASS)} />
                ) : null}
              </div>
              <Skeleton className={cn("mt-2 h-3.5 w-56 max-w-[56vw] rounded-md sm:w-72", TIMER_CARD_BAR_CLASS)} />
              <Skeleton className={cn("mt-2 hidden h-3.5 w-44 rounded-md md:block", TIMER_CARD_BAR_CLASS)} />
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-1 md:flex">
            <Skeleton className={cn("size-8 rounded-md", TIMER_CARD_BAR_CLASS)} />
            <Skeleton className={cn("size-8 rounded-md", TIMER_CARD_BAR_CLASS)} />
            <Skeleton className={cn("size-8 rounded-md", TIMER_CARD_BAR_CLASS)} />
            <Skeleton className={cn("size-8 rounded-md", TIMER_CARD_BAR_CLASS)} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-4 sm:gap-6">
          {COUNTDOWN_PARTS.map((part) => (
            <div key={part} className="flex flex-col items-center gap-2">
              <Skeleton className={cn("h-10 w-12 rounded-lg sm:h-12 sm:w-14", TIMER_CARD_BAR_CLASS)} />
              <Skeleton className={cn("h-2.5 w-10 rounded-full", TIMER_CARD_BAR_CLASS)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HomeMainLoadingSkeleton(props: Readonly<{ announce?: boolean }>) {
  const announce = props.announce ?? true
  const label = formatMessage("home.loading.title")

  return (
    <div
      aria-live={announce ? "polite" : undefined}
      aria-label={announce ? label : undefined}
      aria-busy={announce ? true : undefined}
    >
      {announce ? <ScreenReaderLoadingLabel label={label} /> : null}
      <QuickAddTimerLoadingSkeleton />
      <OrganizerBarLoadingSkeleton />
      <div className="grid gap-4">
        {TIMER_CARD_SKELETONS.map((card) => (
          <TimerCardLoadingSkeleton key={card.id} pinned={card.pinned} withImage={card.withImage} />
        ))}
      </div>
    </div>
  )
}

function GenericMainLoadingSkeleton() {
  return (
    <div data-loading-region="generic-main" className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-44 rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid min-w-0 flex-1 gap-2">
            <Skeleton className="h-4 w-40 rounded-md" />
            <Skeleton className="h-3 w-56 max-w-full rounded-md" />
          </div>
        </div>
        <Skeleton className="h-9 w-full rounded-md" />
      </div>

      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-3/4 rounded-md" />
      </div>
    </div>
  )
}

export function AuthMainLoadingSkeleton(props: Readonly<{ announce?: boolean }>) {
  const announce = props.announce ?? true
  const label = formatMessage("auth.loading.title")

  return (
    <div
      aria-live={announce ? "polite" : undefined}
      aria-label={announce ? label : undefined}
      aria-busy={announce ? true : undefined}
    >
      {announce ? <ScreenReaderLoadingLabel label={label} /> : null}
      <div data-loading-region="auth-main" className="grid gap-6">
        <div className="grid gap-1">
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="h-4 w-72 max-w-full rounded-md" />
        </div>

        <div className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-12 rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </div>
  )
}

export function SharedTimerMainLoadingSkeleton(props: Readonly<{ announce?: boolean }>) {
  const announce = props.announce ?? true
  const label = formatMessage("share.loading.title")

  return (
    <div
      aria-live={announce ? "polite" : undefined}
      aria-label={announce ? label : undefined}
      aria-busy={announce ? true : undefined}
    >
      {announce ? <ScreenReaderLoadingLabel label={label} /> : null}
      <div data-loading-region="shared-timer-main" className="rounded-3xl border bg-card p-6">
        <div className="min-w-0">
          <Skeleton className="h-5 w-48 max-w-full rounded-md" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full rounded-md" />
        </div>

        <div className="mt-6 grid grid-cols-4 gap-4 sm:gap-6">
          {COUNTDOWN_PARTS.map((part) => (
            <div key={part} className="flex flex-col items-center gap-2">
              <Skeleton className="h-12 w-14 rounded-lg sm:h-14 sm:w-16" />
              <Skeleton className="h-2.5 w-10 rounded-full" />
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 rounded-md bg-primary/20" />
        </div>
      </div>
    </div>
  )
}

export function SettingsMainLoadingSkeleton(props: Readonly<{ announce?: boolean }>) {
  const announce = props.announce ?? true
  const label = formatMessage("settings.loading.title")

  return (
    <div
      aria-live={announce ? "polite" : undefined}
      aria-label={announce ? label : undefined}
      aria-busy={announce ? true : undefined}
    >
      {announce ? <ScreenReaderLoadingLabel label={label} /> : null}
      <div data-loading-region="settings-main" className="grid gap-8">
        <div className="grid gap-1">
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md" />
        </div>

        <section data-loading-region="settings-profile" className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-1">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-4 w-64 max-w-full rounded-md" />
          </div>

          <div className="grid gap-5">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <Skeleton className="size-7 rounded-full" />
              <div className="grid min-w-0 flex-1 gap-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-4 w-52 max-w-full rounded-md" />
              </div>
            </div>

            <div className="grid gap-2">
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-9 min-w-0 rounded-md" />
            </div>
          </div>
        </section>

        <div className="grid gap-6">
          <section data-loading-region="settings-defaults" className="grid gap-4 rounded-lg border p-4">
            <div className="grid gap-1">
              <Skeleton className="h-5 w-32 rounded-md" />
              <Skeleton className="h-4 w-72 max-w-full rounded-md" />
            </div>

            <div className="rounded-lg bg-muted/30 p-3">
              <div className="flex items-start gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="grid min-w-0 flex-1 gap-3">
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-28 rounded-md" />
                    <Skeleton className="h-3 w-60 max-w-full rounded-md" />
                  </div>
                  <Skeleton className="h-9 w-full rounded-md" />
                  <Skeleton className="h-8 w-full rounded-md sm:w-[190px]" />
                </div>
              </div>
            </div>
          </section>

          <section data-loading-region="settings-alerts" className="grid gap-4 rounded-lg border p-4">
            <div className="grid gap-1">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 w-80 max-w-full rounded-md" />
            </div>

            <div className="grid gap-3 rounded-lg bg-muted/30 p-3">
              <div className="grid gap-2">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-3 w-72 max-w-full rounded-md" />
              </div>
              <Skeleton className="h-8 w-full rounded-md sm:w-[190px]" />
            </div>

            <div className="grid gap-3 rounded-lg bg-muted/30 p-3">
              <div className="grid gap-2">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-3 w-64 max-w-full rounded-md" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="grid min-w-0 flex-1 gap-2">
                  <Skeleton className="h-4 w-36 rounded-md" />
                  <Skeleton className="h-3 w-52 max-w-full rounded-md" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <Skeleton className="h-4 w-16 rounded-md" />
                    <Skeleton className="h-3 w-56 max-w-full rounded-md" />
                  </div>
                  <Skeleton className="size-8 rounded-md" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Skeleton className="h-9 rounded-md" />
                  <Skeleton className="h-9 rounded-md" />
                  <Skeleton className="h-9 rounded-md" />
                </div>
              </div>
            </div>
          </section>

          <section data-loading-region="settings-api-keys" className="grid gap-4 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="grid min-w-0 flex-1 gap-2">
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-4 w-80 max-w-full rounded-md" />
              </div>
              <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
            </div>
            <div className="rounded-lg border border-dashed p-4">
              <Skeleton className="h-4 w-44 max-w-full rounded-md" />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function FooterFullLoadingSkeleton() {
  return (
    <footer className="border-t bg-background/60">
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-3 px-4 py-6">
        <Skeleton className="h-3.5 w-44 rounded-md" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Skeleton className="h-4 w-10 rounded-md" />
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </footer>
  )
}

function FooterStatusLoadingSkeleton() {
  return (
    <footer className="sticky bottom-0 z-30 border-t border-border bg-background/85 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-[640px] min-w-0 items-center px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Skeleton className="size-1.5 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-28 max-w-full rounded-md" />
        </div>
      </div>
    </footer>
  )
}

type LoadingFooter = "full" | "status"

function LoadingShell(
  props: Readonly<{
    children: ReactNode
    className?: string
    footer?: LoadingFooter
    label: string
    mainClassName?: string
  }>,
) {
  const main = (
    <main className={cn("mx-auto w-full max-w-[640px] flex-1 px-4 py-6", props.mainClassName)}>{props.children}</main>
  )
  const footer = props.footer === "status" ? <FooterStatusLoadingSkeleton /> : <FooterFullLoadingSkeleton />

  return (
    <div
      aria-live="polite"
      aria-label={props.label}
      aria-busy="true"
      className={cn("flex min-h-svh flex-col bg-background text-foreground", props.className)}
    >
      <ScreenReaderLoadingLabel label={props.label} />
      <AppHeaderLoadingSkeleton />
      {props.footer === "status" ? (
        <section data-slot="timer-list-section" className="relative flex flex-1 flex-col">
          {main}
          {footer}
        </section>
      ) : null}
      {props.footer !== "status" ? main : null}
      {/* The section wrapper scopes full skeleton footers so they never compete
          with page-level contentinfo landmarks rendered by route pages. */}
      {props.footer === "full" ? <section>{footer}</section> : null}
    </div>
  )
}

export function AppShellLoading() {
  return (
    <LoadingShell label={formatMessage("app.loading.title")}>
      <GenericMainLoadingSkeleton />
    </LoadingShell>
  )
}

export function HomePageLoading() {
  return (
    <LoadingShell label={formatMessage("home.loading.title")} className="bg-secondary" footer="status">
      <HomeMainLoadingSkeleton announce={false} />
    </LoadingShell>
  )
}

export function SettingsPageLoading() {
  return (
    <LoadingShell label={formatMessage("settings.loading.title")} footer="full" mainClassName="py-8">
      <SettingsMainLoadingSkeleton announce={false} />
    </LoadingShell>
  )
}

export function AuthPageLoading() {
  return (
    <LoadingShell label={formatMessage("auth.loading.title")} footer="full" mainClassName="max-w-[440px] py-8">
      <AuthMainLoadingSkeleton announce={false} />
    </LoadingShell>
  )
}

export function SharedTimerPageLoading() {
  return (
    <LoadingShell label={formatMessage("share.loading.title")} className="bg-zinc-50 dark:bg-black" footer="full">
      <SharedTimerMainLoadingSkeleton announce={false} />
    </LoadingShell>
  )
}
