import { FooterFull } from "@/components/footer-full"
import { getDocsHref } from "@/lib/docs-config"
import { getPublicReleaseTag } from "@/lib/release.server"

// Server-rendered page-level site footer for the homepage. The slim app
// footer inside the client shell is scoped away from the landmark tree.
export function SiteFooter() {
  return <FooterFull docsHref={getDocsHref()} releaseTag={getPublicReleaseTag()} />
}
