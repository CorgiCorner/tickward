"use client"

import { StarIcon } from "lucide-react"

import { GithubIcon } from "@/components/icons/github-icon"

import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { GITHUB_REPO_URL, useGitHubStars } from "@/hooks/use-github-stars"
import { formatMessage } from "@/lib/i18n/messages"

export const GITHUB_STAR_GOAL = 5000

const STAR_PATTERN_COUNT = 18

function StarCtaPattern() {
  return (
    <div
      aria-hidden="true"
      data-slot="star-cta-pattern"
      className="pointer-events-none absolute inset-x-0 -top-5 h-32 overflow-hidden"
      style={{
        WebkitMaskImage: "radial-gradient(120% 96% at 50% -8%, rgba(0,0,0,0.48) 38%, transparent 82%)",
        maskImage: "radial-gradient(120% 96% at 50% -8%, rgba(0,0,0,0.48) 38%, transparent 82%)",
      }}
    >
      <div className="mx-auto flex max-w-[420px] flex-wrap justify-center gap-x-8 gap-y-5 pt-4 text-muted-foreground/[0.16] [&_svg]:size-[14px]">
        {Array.from({ length: STAR_PATTERN_COUNT }, (_, index) => (
          <StarIcon key={index} />
        ))}
      </div>
    </div>
  )
}

export function GitHubStarCta() {
  const stars = useGitHubStars()
  const locale = useLocale()
  const numberFormatter = new Intl.NumberFormat(locale)
  const current = stars === null ? null : numberFormatter.format(stars)
  const goal = numberFormatter.format(GITHUB_STAR_GOAL)
  const progressLabel =
    current === null
      ? formatMessage("home.starCta.goal", { goal }, locale)
      : formatMessage("home.starCta.progress", { current, goal }, locale)
  const progressWidth = stars === null ? "0%" : `${Math.max((stars / GITHUB_STAR_GOAL) * 100, 1.5)}%`

  return (
    <section aria-labelledby="github-star-cta-title">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-16">
        <div className="relative overflow-hidden rounded-xl border border-border bg-primary/[0.025] p-6 text-center sm:p-8">
          <StarCtaPattern />
          <div className="relative">
            <div className="mx-auto grid size-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
              <StarIcon className="size-4" />
            </div>
            <h2 id="github-star-cta-title" className="mt-4 text-lg font-semibold tracking-tight">
              {formatMessage("home.starCta.title", {}, locale)}
            </h2>
            <p className="mx-auto mt-2 max-w-[480px] text-sm leading-6 text-muted-foreground">
              {formatMessage("home.starCta.description", {}, locale)}
            </p>
            <div className="mx-auto mt-6 w-full max-w-[420px]">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={GITHUB_STAR_GOAL}
                aria-valuenow={stars ?? 0}
                aria-label={progressLabel}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                  style={{ width: progressWidth }}
                />
              </div>
              <div className="mt-2 text-center text-xs tabular-nums text-muted-foreground">{progressLabel}</div>
            </div>
            <Button asChild variant="outline" className="mt-6">
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                <GithubIcon className="size-4" />
                {formatMessage("home.starCta.button", {}, locale)}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
