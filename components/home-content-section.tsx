import {
  BellIcon,
  CalendarDaysIcon,
  Clock3Icon,
  CodeXmlIcon,
  GitBranchIcon,
  HourglassIcon,
  RefreshCwIcon,
  Repeat2Icon,
  Share2Icon,
  TimerIcon,
  ZapIcon,
} from "lucide-react"
import Link from "next/link"

import { appExtensions } from "@/lib/app-extensions"
import { formatMessage } from "@/lib/i18n/messages"

const FEATURES = [
  {
    id: "sync",
    icon: RefreshCwIcon,
    titleKey: "home.content.feature.sync.title",
    descriptionKey: "home.content.feature.sync.description",
  },
  {
    id: "sharing",
    icon: Share2Icon,
    titleKey: "home.content.feature.sharing.title",
    descriptionKey: "home.content.feature.sharing.description",
  },
  {
    id: "embedding",
    icon: CodeXmlIcon,
    titleKey: "home.content.feature.embedding.title",
    descriptionKey: "home.content.feature.embedding.description",
  },
  {
    id: "automation",
    icon: ZapIcon,
    titleKey: "home.content.feature.automation.title",
    descriptionKey: "home.content.feature.automation.description",
  },
  {
    id: "openSource",
    icon: GitBranchIcon,
    titleKey: "home.content.feature.openSource.title",
    descriptionKey: "home.content.feature.openSource.description",
  },
] as const

const PATTERN_ICONS = [TimerIcon, CalendarDaysIcon, Clock3Icon, BellIcon, Repeat2Icon, HourglassIcon] as const
const PATTERN_ICON_COUNT = 42
const INTRO_KEYS = [
  "home.content.intro.timezones",
  "home.content.intro.sharing",
  "home.content.intro.everyday",
] as const

function HomeIconPattern() {
  return (
    <>
      <div
        aria-hidden="true"
        data-slot="home-seo-pattern"
        className="pointer-events-none absolute inset-x-0 -top-12 bottom-0 overflow-hidden"
        style={{
          WebkitMaskImage: "radial-gradient(120% 96% at 50% -8%, rgba(0,0,0,0.5) 44%, transparent 84%)",
          maskImage: "radial-gradient(120% 96% at 50% -8%, rgba(0,0,0,0.5) 44%, transparent 84%)",
        }}
      >
        <div
          className="mx-auto flex flex-wrap justify-center gap-x-9 gap-y-7 text-muted-foreground/[0.16] [&_svg]:size-[22px]"
          style={{ maxWidth: 820 }}
        >
          {Array.from({ length: PATTERN_ICON_COUNT }, (_, index) => {
            const Icon = PATTERN_ICONS[index % PATTERN_ICONS.length]
            return <Icon key={index} />
          })}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[42%] h-44 w-[560px] max-w-full -translate-x-1/2 -translate-y-1/2"
        style={{ background: "radial-gradient(ellipse at center, var(--background) 42%, transparent 72%)" }}
      />
    </>
  )
}

// Server-rendered marketing content below the home app shell. It owns the
// page's single h1 and stays outside the Suspense-wrapped client tree so the
// copy survives hydration and is always present in the streamed HTML.
export function HomeContentSection() {
  const embedHref = appExtensions.marketingHomeEmbedHref?.()

  return (
    <section aria-labelledby="home-hero-title" className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-[640px] px-4 py-16">
        <div className="relative">
          <HomeIconPattern />
          <div className="relative text-center">
            <h1 id="home-hero-title" className="text-[28px] font-semibold leading-tight tracking-normal">
              {formatMessage("home.content.heading")}
            </h1>
            <p className="mx-auto mt-3 max-w-[440px] text-sm leading-6 text-muted-foreground">
              {formatMessage("home.content.description")}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-[560px] gap-4 text-sm leading-6 text-muted-foreground">
          {INTRO_KEYS.map((key) => (
            <p key={key}>{formatMessage(key)}</p>
          ))}
        </div>

        <ul className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <li key={feature.id} className={feature.id === "openSource" ? "flex gap-3 sm:col-span-2" : "flex gap-3"}>
                <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-medium">{formatMessage(feature.titleKey)}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {formatMessage(feature.descriptionKey)}
                  </p>
                  {feature.id === "embedding" && embedHref ? (
                    <Link
                      className="mt-2 inline-flex text-sm font-medium text-foreground hover:underline"
                      href={embedHref}
                    >
                      {formatMessage("home.content.feature.embedding.link")}
                    </Link>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
