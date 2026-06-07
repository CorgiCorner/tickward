"use client"

import { GithubLogoIcon } from "@phosphor-icons/react"
import { StarIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

let cachedStars: number | null = null
let starsRequest: Promise<number | null> | null = null

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
  const [stars, setStars] = useState<number | null>(cachedStars)
  const variant = props.variant ?? "header"

  useEffect(() => {
    if (cachedStars !== null) return

    starsRequest ??= fetch("https://api.github.com/repos/CorgiCorner/tickward", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then(async (res) => {
        if (!res.ok) return null
        const data = (await res.json()) as { stargazers_count?: unknown }
        return typeof data.stargazers_count === "number" ? data.stargazers_count : null
      })
      .catch(() => null)

    void starsRequest.then((nextStars) => {
      if (typeof nextStars === "number") {
        cachedStars = nextStars
        setStars(nextStars)
      }
    })
  }, [])

  const button = (
    <Button
      variant="ghost"
      size={variant === "compact" ? "xs" : "sm"}
      asChild
      className={cn(variant === "compact" ? "gap-1.5 px-2" : "hidden gap-1.5 px-2.5 sm:inline-flex", props.className)}
    >
      <a
        href="https://github.com/CorgiCorner/tickward"
        target="_blank"
        rel="noreferrer"
        aria-label={formatMessage("header.github")}
      >
        <GithubLogoIcon className="size-[1.15rem]" />
        {variant === "compact" ? null : <span className="hidden lg:inline">{formatMessage("header.githubStar")}</span>}
        <span className="inline-flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
          <StarIcon className="size-3 fill-current" />
          {stars === null ? "Star" : compactNumber(stars)}
        </span>
      </a>
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={variant === "compact" ? "top" : "bottom"} sideOffset={8}>
        {formatMessage("header.github")}
      </TooltipContent>
    </Tooltip>
  )
}
