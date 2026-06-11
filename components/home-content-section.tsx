import { formatMessage } from "@/lib/i18n/messages"

const FEATURES = [
  {
    id: "sync",
    titleKey: "home.content.feature.sync.title",
    descriptionKey: "home.content.feature.sync.description",
  },
  {
    id: "sharing",
    titleKey: "home.content.feature.sharing.title",
    descriptionKey: "home.content.feature.sharing.description",
  },
  {
    id: "embedding",
    titleKey: "home.content.feature.embedding.title",
    descriptionKey: "home.content.feature.embedding.description",
  },
  {
    id: "automation",
    titleKey: "home.content.feature.automation.title",
    descriptionKey: "home.content.feature.automation.description",
  },
  {
    id: "openSource",
    titleKey: "home.content.feature.openSource.title",
    descriptionKey: "home.content.feature.openSource.description",
  },
] as const

// Server-rendered marketing content below the home app shell. It owns the
// page's single h1 and stays outside the Suspense-wrapped client tree so the
// copy survives hydration and is always present in the streamed HTML.
export function HomeContentSection() {
  return (
    <section aria-labelledby="home-hero-title" className="border-t bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-[640px] px-4 py-10">
        <div className="mx-auto max-w-[560px] text-center">
          <h1 id="home-hero-title" className="text-2xl font-semibold tracking-normal">
            {formatMessage("app.title.default")}
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] text-sm leading-6 text-muted-foreground">
            {formatMessage("app.description")}
          </p>
        </div>

        <h2 className="mt-10 text-lg font-semibold">{formatMessage("home.content.title")}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature.id} className="rounded-2xl border bg-card p-4">
              <h3 className="text-sm font-medium">{formatMessage(feature.titleKey)}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{formatMessage(feature.descriptionKey)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
