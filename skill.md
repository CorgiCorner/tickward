---
name: tickward
description: Manage tickward countdown projects, timers, spaces, and share links through the versioned public API.
license: AGPL-3.0-only
compatibility: Requires a tickward API key. Read-only keys can inspect resources; full-access keys can create, update, and delete resources.
metadata:
  version: "1.0"
---

# tickward

Use this skill when a user wants to manage countdown timers, organize them into
spaces, or create static share links.

## Capabilities

- List, create, update, and delete projects.
- List, create, update, archive, and delete timers.
- List, create, update, and delete spaces.
- Create, inspect, and delete timer share links.
- Manage webhook endpoints from Settings for event-driven integrations.
- Use MCP clients for agent workflows when a remote endpoint or API key is
  configured.

## Authentication

Use a Bearer API key in the `Authorization` header:

```text
Authorization: Bearer tw_your_api_key
```

Use read-only keys for questions and full-access keys for requested changes.
Remote MCP connections use OAuth scopes. If a write fails with
`insufficient_scope`, tell the user which `required_scope` is missing and ask
them to reconnect the MCP client with that scope.

## Workflow

1. Check `GET /capabilities` before choosing a workflow.
2. Resolve the target project with `GET /projects`.
3. For a new project with spaces or timers, call `POST /projects/preview` before `POST /projects`.
4. Create missing spaces before creating timers assigned to those spaces.
5. Create timers with `label`, `target_date`, and `timezone`.
6. Create share links only after the user asks to share a timer.
7. Confirm before deleting any project, timer, space, or share link.
8. Send `Idempotency-Key` on write requests that may be retried.

## Constraints

- Public API base URL: `https://tickward.com/api/v1`.
- Request fields use snake_case.
- Dates use ISO 8601 strings.
- Timezones use IANA timezone names such as `Europe/Warsaw`.
- When reading timers, use `effective_target_date` for the current countdown
  date. For recurring timers, `target_date` is the original schedule anchor.
- When confirming timer changes, show `project_name`, timer label, and date.
  Do not show raw project ids unless the user asks for ids.
- When confirming space or share changes, show `project_name`. Share responses
  include `timer_label` when the timer still exists.
- `Idempotency-Key` replays the same write response for up to 24 hours when the method, path, query, and JSON body match.
- Generate `Idempotency-Key` with a random UUID plus an operation prefix, for example `timer-create-${crypto.randomUUID()}`.
- `DELETE ...?dry_run=true` previews project and space deletes without mutating data.
- `POST /projects/preview` returns a `plan_hash`; send it as `expected_plan_hash` when creating the project.
- Webhook delivery is asynchronous. Self-hosted deployments must run the scheduler tick endpoint for delivery and retry.
- Errors use `{ "error": { "type": "...", "message": "...", "remediation": { "hint": "..." } } }`.
