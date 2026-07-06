# tickward usage-limit timers for coding agents

Auto-create a tickward countdown that ends exactly when your Claude Code or
Codex usage limit resets, with an in-app reminder (plus email, if enabled)
shortly before the reset. Stop guessing when you can prompt again.

| Example | Tool | Wiring |
| - | - | - |
| `claude-code/usage-limit-hook.mjs` | Claude Code | statusline command (default) and/or `StopFailure` hook |
| `codex/usage-limit-watcher.mjs` | Codex CLI | cron / launchd, every ~5 minutes |

Both scripts are zero-dependency Node.js 18+ and talk to the tickward public
API:

```txt
POST $TICKWARD_BASE_URL/api/v1/projects/$TICKWARD_PROJECT_ID/timers
Authorization: Bearer $TICKWARD_API_KEY
```

## Prerequisites

1. A tickward account with an API key and a project id (see the API
   quickstart at `/docs/guides/api-quickstart`).
2. Email reminders enabled in Settings -> Notifications, if you want the
   reminder by email as well as in-app.

## Configuration

| Variable | Required | Default | Notes |
| - | - | - | - |
| `TICKWARD_BASE_URL` | yes | - | Your tickward instance origin, e.g. `https://your-tickward-instance.example` |
| `TICKWARD_API_KEY` | yes | - | API key with access to the project |
| `TICKWARD_PROJECT_ID` | yes | - | Project that receives the timers |
| `TICKWARD_REMINDER_MINUTES` | no | `10` | Reminder offset before the reset |
| `TICKWARD_USAGE_THRESHOLD` | no | `80` | Utilization percent that triggers timer creation |
| `TICKWARD_DRY_RUN` | no | unset | Set to `1` to verify credentials and print what would be created without creating timers |

### Try it without creating anything

Run either script once with `TICKWARD_DRY_RUN=1` to check your credentials and
see what would be created; the script verifies the API key with a GET request
and prints a `[tickward] dry-run: would create timer ...` line instead of
creating a timer.

## Claude Code

The script reads one JSON document from stdin and works in two modes:

- **Statusline mode (default, recommended):** Claude Code pipes statusline
  JSON (including `rate_limits.five_hour` / `rate_limits.seven_day`, each
  with `used_percentage` and `resets_at`; present for Claude Pro/Max
  subscription sessions after the first response) on every
  refresh. When a window's `used_percentage` crosses `TICKWARD_USAGE_THRESHOLD`,
  the script creates the timer and appends `5h resets HH:MM` to the status
  text. It always prints a status line and never exits non-zero.
- **Hook mode:** wired as a `StopFailure` hook with matcher `rate_limit`, it
  fires when a turn actually dies on a rate limit and creates timers for any
  window that reports a future reset time. If the payload carries no reset
  data, it exits silently.

Export the `TICKWARD_*` variables in your shell profile, or set them in the
`env` block of `~/.claude/settings.json`, so the commands below can read them.

Statusline, in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node <path-to>/claude-code/usage-limit-hook.mjs"
  }
}
```

`StopFailure` hook, in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "node <path-to>/claude-code/usage-limit-hook.mjs"
          }
        ]
      }
    ]
  }
}
```

Timer ids are `cc-5h-<reset unix ts>-<project suffix>` and
`cc-7d-<reset unix ts>-<project suffix>`, and the script remembers
already-created ids in a small state file in your temp directory, so repeated
statusline refreshes for the same reset window skip the network entirely.

## Codex

Codex has no equivalent hook, so the watcher polls instead: it spawns
`codex app-server`, reads the account rate limits over JSON-RPC
(`initialize` -> `account/rateLimits/read`), kills the child, and creates a
timer for every window that is above the threshold (or already exhausted)
with a future reset time. When there is nothing to do it exits 0.

Create an env file, for example `<path-to>/codex/env`:

```cron
TICKWARD_BASE_URL=https://your-tickward-instance.example
TICKWARD_API_KEY=placeholder
TICKWARD_PROJECT_ID=placeholder
```

Cron, every 5 minutes:

```cron
*/5 * * * * set -a; . <path-to>/codex/env; set +a; node <path-to>/codex/usage-limit-watcher.mjs
```

macOS launchd, e.g. `~/Library/LaunchAgents/com.example.tickward-usage-watcher.plist`
(replace `<path-to-node>` with the output of `which node` - launchd does not
use your shell `PATH` - then load with `launchctl load` on the file):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.tickward-usage-watcher</string>
  <key>ProgramArguments</key>
  <array>
    <string><path-to-node></string>
    <string><path-to>/codex/usage-limit-watcher.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TICKWARD_BASE_URL</key>
    <string>https://your-tickward-instance.example</string>
    <key>TICKWARD_API_KEY</key>
    <string>&lt;api-key&gt;</string>
    <key>TICKWARD_PROJECT_ID</key>
    <string>&lt;project-id&gt;</string>
  </dict>
  <key>StartInterval</key>
  <integer>300</integer>
</dict>
</plist>
```

Timer ids are `cdx-<window minutes or key>-<reset unix ts>-<project suffix>`,
e.g. `cdx-300-1780000000-x4kq2m` for a 5h window.

## How duplicates are avoided

Every reset window maps to one deterministic timer id, and the same id is
sent as the `Idempotency-Key` header. Idempotency keys expire after 24
hours, so for weekly windows the client-supplied id is the real dedupe: a
duplicate id is rejected with an "already exists" validation error, which
both scripts treat as success.

## Troubleshooting

- `401` - wrong or revoked `TICKWARD_API_KEY`.
- `404` - wrong `TICKWARD_PROJECT_ID`, or the key has no access to it.
- Timer-limit errors - projects cap the number of timers; clean up ended
  reset timers (they are easy to spot by the `cc-` / `cdx-` id prefixes).
- `codex`/`node` not found under cron or launchd - cron runs with a minimal
  `PATH`; use absolute binary paths or set `PATH=` in the crontab.

Full walkthrough, including agent-assisted install prompts:
`/docs/guides/claude-code-codex-usage-limits`.
