# Changelog

## Unreleased

No unreleased public changes.

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
