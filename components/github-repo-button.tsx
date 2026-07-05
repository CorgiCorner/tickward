"use client"

import { GithubIcon, StarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { GITHUB_REPO_URL, useGitHubStars } from "@/hooks/use-github-stars"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

function compactNumber(value: number) {
  if (value < 1000) return String(value)
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1, notation: "compact" }).format(value)
}

export function GitHubRepoButton(
  props: Readonly<{
    className?: string
    variant?: "header" | "compact"
  }>,
) {
  const stars = useGitHubStars()
  const variant = props.variant ?? "header"
  const starLabel = stars === null ? formatMessage("header.githubStar") : compactNumber(stars)

  if (variant === "compact") {
    const button = (
      <Button
        variant="outline"
        size="sm"
        asChild
        className={cn(
          "group h-8 overflow-hidden border-border bg-background p-0 text-xs font-medium shadow-none hover:bg-muted",
          props.className,
        )}
      >
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" aria-label={formatMessage("header.github")}>
          <span className="inline-flex h-full items-center gap-1.5 px-2.5 text-muted-foreground group-hover:text-foreground">
            <GithubIcon className="size-3.5" />
          </span>
          <span className="inline-flex h-full items-center gap-1 border-l border-border px-2.5 tabular-nums">
            <StarIcon className="size-3 text-muted-foreground" />
            {starLabel}
          </span>
        </a>
      </Button>
    )

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          {formatMessage("header.github")}
        </TooltipContent>
      </Tooltip>
    )
  }

  const button = (
    <Button variant="ghost" size="sm" asChild className={cn("hidden gap-1.5 px-2.5 sm:inline-flex", props.className)}>
      <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" aria-label={formatMessage("header.github")}>
        <GithubIcon className="size-[1.15rem]" />
        <span className="hidden lg:inline">{formatMessage("header.githubStar")}</span>
        <span className="inline-flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
          <StarIcon className="size-3 fill-current" />
          {starLabel}
        </span>
      </a>
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {formatMessage("header.github")}
      </TooltipContent>
    </Tooltip>
  )
}
