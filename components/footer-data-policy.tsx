"use client"

import { InfoIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type FooterDataPolicyProps = {
  summary: string
  /** Retention disclosures; when empty the summary renders as plain text. */
  details: string[]
  detailsLabel: string
}

// Client leaf for the server-rendered footer: the summary line plus an info
// tooltip listing the retention windows that apply to this deployment.
export function FooterDataPolicy(props: Readonly<FooterDataPolicyProps>) {
  if (props.details.length === 0) {
    return <p className="leading-relaxed">{props.summary}</p>
  }

  return (
    <p className="flex items-center gap-1.5 leading-relaxed">
      <span>{props.summary}</span>
      {/* Local provider: the footer also renders on pages outside the app
          layout's TooltipProvider. */}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={props.detailsLabel}
              className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              <InfoIcon aria-hidden className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="max-w-[280px]">
            <ul className="grid gap-1 text-left">
              {props.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </p>
  )
}
