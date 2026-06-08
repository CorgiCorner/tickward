# Changelog

## Unreleased

No unreleased public changes.

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
