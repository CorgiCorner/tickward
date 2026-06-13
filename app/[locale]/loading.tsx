import { AppShellLoading } from "@/components/app-shell-loading"

// Neutral default fallback for [locale] routes that do not define their own
// loading state. Deliberately generic — NOT the homepage timer skeleton, which
// leaked onto content/marketing pages. The homepage still shows its own timer
// skeleton via the Suspense boundary inside its page, and content routes
// (timers, use-cases) provide their own route-level skeletons.
export default function Loading() {
  return <AppShellLoading />
}
