import Link from "next/link"

import { appExtensions } from "@/lib/app-extensions"
import { formatMessage, type Locale } from "@/lib/i18n/messages"

export function HomeUseCasesSection(props: Readonly<{ locale: Locale }>) {
  const links = appExtensions.marketingHomeUseCases?.(props.locale) ?? []
  if (links.length === 0) return null

  return (
    <section aria-labelledby="home-use-cases-title" className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-[640px] px-4 py-12">
        <h2 id="home-use-cases-title" className="text-xl font-semibold tracking-normal">
          {formatMessage("home.useCases.heading", {}, props.locale)}
        </h2>
        <ul className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                className="text-sm leading-relaxed text-muted-foreground hover:text-foreground hover:underline"
                href={link.href}
                hrefLang={link.hrefLang}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
