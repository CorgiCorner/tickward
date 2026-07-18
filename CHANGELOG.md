# Changelog

## Unreleased

## 0.14.1 - 2026-07-18

### Changed

- Made timer creation start with Name and keep optional description, link, and space controls in a compact Details section while editing keeps them directly available.

## 0.14.0 - 2026-07-17

### Added

- Added count-up timers that celebrate derived day, week, month, and year milestones with reminders and `timer.milestone` webhooks.
- Added non-blocking form warnings when a reminder offset may be skipped because it exceeds the spacing between recurring or milestone occurrences.
- Added finite milestone ladders for irregular celebrations such as 1 day, 3 days, 1 week, and 1 month since an anchor.
- Added manual project ordering that stays synchronized across the web and desktop apps.
- Added guided timer creation with countdown and count-up templates, confirmed direction suggestions, and live schedule previews.
- Added a guided edit action that starts a new count-up timer from a past countdown, with optional archival and Undo.

### Changed

- Changed the OpenAPI milestone-rule schema to a `oneOf` of periodic `{ unit, every }` rules and explicit `{ unit, at }` ladders; clients may need regenerated types.

### Fixed

- Clarified milestone rule modes with concise labels, plain-language guidance, and tooltips explaining regular intervals and specific milestones.
- Kept unseen finished timers in Review until first shown, made Review countdowns survive restarts and policy changes, and clarified the Review settings.
- Improved timer creation with direction-aware date shortcuts, recoverable at-the-moment reminders, clearer milestone choices, and visible automatic naming for presets.

## 0.13.1 - 2026-07-16

### Fixed

- Fixed multi-architecture container publishing for Docker Hub and GHCR.

## 0.13.0 - 2026-07-16

### Added

- Added a per-user "Started counting up" review flow for one-off timers with project indicators, zero-cross notifications, and cross-device state.
- Added one global acknowledgement policy while repeating timers continue directly to their next occurrence.

### Changed

- Renamed "Move to Past" to "Acknowledge" and placed acknowledgement and deferral in a compact menu beside the count-up badge.
- Replaced visible expiry text with a scheduled-status icon and aligned the elapsed-timer section with desktop as "Counting up".
- Increased the spacing below the Terms of Service and Privacy Policy notice in the sign-in form.
- Container releases use one versioned dispatch, refresh `edge` for release and manual `main` builds, share architecture caches, and publish to Docker Hub independently from GHCR.

### Removed

- Removed the incomplete account migration interface and its import/export API.

## 0.12.0 - 2026-07-15

### Added

- Added a homepage section for discovering and downloading the native macOS app.
- Added configurable PostgreSQL pool limits, timeouts, and application naming for self-hosted deployments.
- Added privacy and terms links to the sign-in flow.

### Changed

- Pinned the supported Node 22 development runtime and refreshed supported application and CI dependencies.

### Fixed

- Kept the active space in the URL, restored it on page load, and removed invalid or cleared space parameters.

## 0.11.0 - 2026-07-12

### Added

- Added runtime plan limits, self-hosted admin onboarding, and an editor for plan limits.
- Added account project import and deployment-safe migration support within cloud limits.
- Added privacy, terms, cookies, subprocessors, and desktop download pages.

### Changed

- Updated vulnerable transitive dependencies used by runtime integrations, browser tests, builds, and release tooling.
- Improved accessibility semantics and modernized maintainability-sensitive UI, API, and script code.

### Fixed

- Reconciled signed-out inbox sessions, excluded embeds from analytics, and improved calendar, marketing, toast, and retention UI behavior.
- Hardened API, webhook, service worker, snapshot, executable-path, credential, stored-hash, CI, and test boundaries.

## 0.10.0 - 2026-07-09

### Added

- Made over-limit projects read-only with scheduled cleanup instead of
  deleting them outright.

### Fixed

- Signed-in users now auto-claim their anonymous projects, and sign-out races
  no longer drop project data.
- Stopped re-uploading an account project after a 404 refresh and fixed the
  read-only badge overflow in the project switcher.
- Scoped project listing and sync reads through the API to the key owner's
  own data.
- Fixed the focus-mode countdown font.

## 0.9.1 - 2026-07-07

### Fixed

- Stopped the footer Docs link from triggering Next.js RSC prefetch requests to
  the redirect-only `/docs` endpoint.

## 0.9.0 - 2026-07-06

### Added

- Added an Italian translation of the app. Grazie to
  [@albanobattistella](https://github.com/albanobattistella) for contributing
  the initial catalog.
- Added a desktop browser-connect flow with PKCE device grants.
- Added an in-app notifications toggle in settings.
- Added a usage-limit reset timer guide and examples for AI coding agents.

### Changed

- Added confirmation before deleting a shared timer and preserved its id when
  undoing the delete.
- Moved elapsed timers into a dedicated past section.

### Fixed

- Added missing Italian copy for the desktop connect flow.
- Defaulted timer sorting to soonest first.
- Included the spaces read scope in desktop connect grants.

## 0.8.0 - 2026-07-05

### Added

- Added calendar-style timer reminders with in-app inbox, Web Push, and opt-in email delivery.
- Added duration-based timer creation, optional labels, and native mobile date/time pickers.
- Added `llms.txt`, `llms-full.txt`, and a plans-and-limits docs page for self-hosted limits.

### Changed

- Refreshed the demo project and press screenshots with recurring and completed timers.
- Improved timer-list and account-surface responsiveness with lazy loading and boundary-based updates.

### Fixed

- Prevented iOS Safari from zooming while using Quick Add.
- Stopped expired embeds from reload-looping and kept timer rendering resilient to unsupported time zones.
- Corrected public copy and docs around timer/project limits and self-hosted limit variables.
- Stopped duplicate inbox polling and kept recurring reminders active.

## 0.7.1 - 2026-06-30

### Added

- Published container images to GHCR and Docker Hub from release tags.

## 0.7.0 - 2026-06-29

### Added

- Redesigned the home page.
- Made the per-project active-timer limit configurable, including in the Docker image.
- Added a public /api/health endpoint reporting app and database status.
- Showed a live service-status dot in the footer, driven by the public status page.
- Added an optional link on each timer, shown as an external-link icon by its title.
- Allowed pinning more than one timer at a time.

### Changed

- Showed a timer's description in place of its date line, on a single line.

### Fixed

- Aligned the timer card countdown with the title instead of the drag handle.

## 0.6.0 - 2026-06-27

### Added

- Wrapped the app in error boundaries and added a pluggable client error reporter with a no-op default, so you can wire your own monitoring.
- Showed a muted bell next to a timer's title when its notifications are on.
- Added timer editing, sync status, and moving timers across projects to the spaces UI.

### Changed

- Made the Quick Add submit a plus icon with a hover tooltip.
- Served images unoptimized since the app ships pre-sized assets, keeping the build small.
- Emitted production browser source maps so client error stacks point at real source instead of minified chunks.

### Fixed

- Padded overlays for the iOS safe area and guarded narrow-screen overflow.
- Tidied the project-claim toast: removed the double box, right-aligned the button, and stopped it reading the timer store.
- Permitted the configured error-monitoring script source and ingest origin under the content security policy.

## 0.5.0 - 2026-06-13

### Changed

- Locale-prefixed every public route except the homepage, redirecting bare default-locale URLs to their `/en/...` form.
- Unified the content and press pages on a shared page shell with one consistent, narrower width.
- Replaced the default loading state with a neutral app-shell skeleton instead of the homepage timer one.

### Fixed

- Fired finishing timer alarms reliably in background tabs by scheduling against absolute time.
- Preserved the query string on locale rewrites so the sign-in code field shows.
- Allowed the configured CDN image host under the content security policy.

## 0.4.0 - 2026-06-12

### Added

- Added locale-aware public routes and Polish UI copy for the app shell,
  settings, sharing, embeds, and account surfaces.
- Added more public docs concepts and guides for API usage, MCP setup,
  webhook scheduling, recurrence, notifications, sharing, and timer storage.
- Added embed end-state options for automatic count-up, custom done messages,
  and finished-state messaging.

### Changed

- Kept curated timer and use-case content out of the public snapshot while
  preserving a clean public footer, sitemap, and extension-point boundary.
- Updated public docs routing and navigation so the same docs content works in
  the app and the docs site.

### Fixed

- Improved embed background scoping, compact spacing, target-date display,
  loading state, and recurring-timer target resolution.
- Fixed background-tab timer ticking by sharing one worker-backed clock across
  timer surfaces.

## 0.3.2 - 2026-06-12

### Added

- Added embed end-state controls: `end=auto`, `end=message`, `end=countup`,
  plus `done=` for replacing the finished message.

### Fixed

- Made recurring shared timers resolve to the next effective one-shot target in
  embeds without showing repeat metadata in the iframe.

## 0.3.1 - 2026-06-12

### Fixed

- Kept embed backgrounds scoped to the bordered timer surface instead of
  painting the outer iframe area, while preserving the border on transparent
  framed embeds.
- Tightened square embed vertical spacing between the title, countdown grid,
  and target date.
- Added the target date to compact embeds by default, with `target=off` still
  available for very tight placements.
- Replaced the inherited page loader inside embed iframes with a layout-aware
  embed loader that matches the selected variant.

## 0.3.0 - 2026-06-11

### Added

- Added embeddable timer pages, public embed metadata, and copyable embed
  snippets for shared timers.
- Added timer focus mode with pastel themes and an action overflow menu.
- Added a press kit page with downloadable Tickward logos, product screenshots,
  boilerplate, fact sheet, and a full press kit archive.
- Added a persistent homepage content section and full site footer.
- Added public docs for countdown accuracy and embedding timers.

### Changed

- Moved docs content under the public docs site structure and updated docs
  redirect handling.
- Refreshed the demo seed around life-moments examples for screenshots and
  previews.
- Improved project-claim messaging, timer-card actions, header/footer layout,
  and signed-in homepage presentation.

### Fixed

- Polished embedded timer sizing and snippet preview behavior.
- Fixed marketing route indexing and metadata coverage.
- Fixed repeat previews so timers spanning multiple years show the year.
- Improved OTP input, space color swatches, and focus-button tooltip behavior.

## 0.2.2 - 2026-06-11

### Added

- Added a Cloudflare Workers cron scheduler example under
  `examples/scheduler/cloudflare-worker` and expanded the webhooks guide with a
  scheduler playbook covering cron setup, the scheduler secret, and local
  handler testing.

### Fixed

- Made webhook delivery history easier to scan: attempts, HTTP status, last
  attempt, and created time now render on separate lines, and delivery errors
  wrap instead of being truncated.

## 0.2.1 - 2026-06-11

### Added

- Added an Agent Ready smoke check for the public site.

### Changed

- Shortened webhook row actions and made enable/disable icons easier to scan.

### Fixed

- Moved the WebMCP registration script to Next.js `beforeInteractive` loading so
  the homepage no longer logs a client-side script warning.

## 0.2.0 - 2026-06-09

### Added

- Added account webhooks with signed deliveries, event subscriptions, retryable
  dispatch, and delivery history.
- Added a Webhooks panel in Settings with signing-secret copy, event selection,
  and a direct docs link.
- Added a self-hosted scheduler endpoint for webhook delivery and retry
  processing.
- Added agent discovery metadata endpoints, API catalog metadata, and readable
  agent docs routes.

### Changed

- Expanded public API and MCP metadata so agents can discover capabilities and
  auth requirements more easily.
- Updated self-hosting docs with scheduler and webhook security setup notes.

## 0.1.2 - 2026-06-08

### Added

- Added `project_name` and `effective_target_date` to public timer API
  responses for agent-friendly answers and confirmations.
- Added a custom favicon for the Mintlify docs site.

### Changed

- Default account alarm preferences now use full-page alerts and the polite
  sound.
- Clarified Settings copy so browser permissions are shown as device
  notifications, while full-page and sound alerts are account alarm defaults.

### Fixed

- Sound choices no longer play a different fallback tone when selected. The
  preview button now owns sound playback.
- The homepage now applies signed-in account alarm preferences before local
  timer alarms run.
- Root Mintlify docs now include the favicon and the same OpenAPI/agent docs as
  the docs source folder.
- MCP connections with mixed OAuth scopes are shown as scoped write access
  instead of full access in Settings.

## 0.1.1 - 2026-06-08

### Added

- Added a small MCP connector icon for remote setup.

### Changed

- Clarified ChatGPT MCP setup, OAuth discovery, default scopes, and Server URL
  configuration.
- Improved mobile OTP layout, signed-in sign-in state, header spacing, footer
  wrapping, project switcher controls, and space color spacing.

### Fixed

- Reduced empty-state spacing when a project has no timers.

## 0.1.0 - 2026-06-08

### Added

- Added remote MCP setup docs for ChatGPT, Claude, local agents, and self-hosted
  deployments.
- Added a Settings link to the MCP setup guide.
- Added public API recipes for retry-safe writes, project setup previews, and
  destructive delete previews.

### Changed

- Clarified that remote MCP uses OAuth and local scripts use API keys.
- Improved API docs for idempotency keys, capabilities, and agent-friendly
  errors.

### Fixed

- Fixed docs navigation for recipe pages and MCP setup.
- Improved mobile project settings, timer card, and loading behavior.

## 0.0.1 - 2026-06-06

### Added

- Initial public AGPL-3.0 release.
- Self-hostable Next.js countdown timer app with Docker Compose support.
- Timezone-aware timers with projects, spaces, restore keys, and read-only share
  links.
- Local Redis plus Upstash-compatible Redis REST proxy for self-hosted
  development and deployment.
- Public contribution, security, license, dependency, and self-hosting
  documentation.
