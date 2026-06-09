# tickward

tickward is a self-hostable countdown timer service for creating timezone-aware
timers, organizing them into projects and spaces, and syncing/restoring timer
state through restore keys. The app is built with Next.js and stores projects,
timers, shares, notification outbox records, delivery logs, and push
subscriptions in PostgreSQL. Redis is used only for rate limiting through an
Upstash-compatible REST API.

## Quick Start

```bash
git clone https://github.com/CorgiCorner/tickward.git tickward
cd tickward
cp .env.example .env
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- Timezone-aware timers with descriptions, images, recurrence, archive/restore,
  and pinning.
- Projects and spaces, with local filters for notification-enabled and shared
  timers.
- Read-only timer share links under `/share/...`.
- Optional email-code accounts with anonymous project claiming.
- Device notifications, full-page alarms, and local notification sounds.
- PostgreSQL-backed project data, share records, notification outbox records,
  delivery logs, push subscription records, and hashed public API keys.

## Documentation

Detailed setup, configuration, API, and agent docs live in the docs site:

- [Self-hosting guide](guides/self-hosting.mdx)
- [API quickstart](guides/api-quickstart.mdx)
- [MCP setup](guides/mcp.mdx)
- [API reference](api-reference.mdx)
- [Agent usage](guides/agent-usage.mdx)

## License

tickward is released under the GNU Affero General Public License v3.0. See
[LICENSE](LICENSE).

## Changelog

Release notes are tracked in [CHANGELOG.md](CHANGELOG.md).

## Contributing

Public contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for
details.
