import Link from "next/link"

import { formatMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

const GITHUB_REPO_URL = "https://github.com/CorgiCorner/tickward"

function FooterLinks(props: Readonly<{ docsHref?: string | null }>) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {props.docsHref ? (
        <Link className="hover:text-foreground" href={props.docsHref}>
          {formatMessage("footer.docs")}
        </Link>
      ) : null}
      <a className="hover:text-foreground" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
        {formatMessage("footer.github")}
      </a>
      <Link className="hover:text-foreground" href="/press">
        {formatMessage("footer.press")}
      </Link>
    </div>
  )
}

function FooterCopyright() {
  const year = new Date().getFullYear()

  return (
    <div className="text-[11px] leading-none text-muted-foreground/70">
      <span>{formatMessage("app.browserTitle.default")}</span>{" "}
      <span>{formatMessage("footer.copyrightYear", { year })}</span>
    </div>
  )
}

function ReleaseTagBadge(props: Readonly<{ releaseTag: string }>) {
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] leading-none text-muted-foreground ring-1 ring-border/60">
      {props.releaseTag}
    </span>
  )
}

type FooterFullProps = {
  className?: string
  docsHref?: string | null
  releaseTag: string
}

export function FooterFull({ className, docsHref, releaseTag }: Readonly<FooterFullProps>) {
  return (
    <footer className={cn("border-t bg-background", className)}>
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-3 px-4 py-6 text-center text-xs text-muted-foreground">
        <p className="leading-relaxed">{formatMessage("footer.inactivityPolicy")}</p>
        <FooterLinks docsHref={docsHref} />
        <div className="flex items-center gap-2">
          <FooterCopyright />
          <ReleaseTagBadge releaseTag={releaseTag} />
        </div>
      </div>
    </footer>
  )
}
