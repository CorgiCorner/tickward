# Count-up occurrence API

`/api/timer-attention` is the authoritative signed-in, cross-device sync endpoint
for the per-user overlay shown when a non-recurring timer starts counting up. The
timer itself remains in its normal business state; each `CountUpOccurrence`
describes whether one user has been shown, acknowledged, or deferred one crossing.

The endpoint path and the top-level JSON field `events` are retained as stable wire
contracts for existing clients. Domain code calls each persisted item a count-up
occurrence; `ZeroCrossEvent` is reserved for the transient detection moment.

The product behavior and the deliberate exclusion of repeating timers are
documented in [Started Counting Up](site/concepts/started-counting-up.mdx).

## Identity and access

- Requests require a Better Auth user session.
- Records are isolated by `userId`.
- A request may access projects owned by that user and the project represented
  by a valid, active restore key on the request.
- The stable occurrence key is `${timerId}|${targetAtMs}`. Clients must not
  change its format.
- Database identity is `(userId, projectId, timerId, targetAtMs)`. Mutation
  requests should include `projectId` when acting inside one project because
  timer IDs are only project-unique. Omitting it intentionally applies a bulk
  action to matching accessible occurrences across projects.
- `projectId` is stored separately so the server can validate the exact
  project-local timer and group a user's active occurrences efficiently.

The project link is deliberately denormalized onto `CountUpOccurrence`
instead of being rediscovered from an unscoped timer ID on every read. Timer
IDs are unique only inside a project, so the composite relation
`(projectId, timerId)` is also what makes pruning and grouping unambiguous.

All mutation responses have the same shape as `GET`, so clients can replace or
merge their cached state with authoritative server state.

## GET `/api/timer-attention`

Returns the user's accessible occurrences, including acknowledged occurrences
that have not yet been pruned:

On read, the server also discovers naturally crossed non-recurring timers in
all accessible projects. First-run discovery is bounded to the previous 48
hours and requires both timer creation and last update to predate the target,
so old accounts, past-date creation, and future-to-past edits do not flood the
review state.

```json
{
  "events": [
    {
      "key": "timer_123|1784205600000",
      "projectId": "project_123",
      "projectName": "Marketing",
      "timer": {
        "label": "Campaign launch",
        "pinned": false
      },
      "timerId": "timer_123",
      "targetAtMs": "1784205600000",
      "crossedAt": "2026-07-16T10:00:00.000Z",
      "firstSeenAt": null,
      "acknowledgedAt": null,
      "deferredUntil": null,
      "policy": {
        "mode": "until-i-move-it",
        "minutes": null
      }
    }
  ]
}
```

`targetAtMs` is a decimal string because the database stores it as `BigInt`.
All other timestamps are ISO 8601 strings with an offset or `null`. The
`timer` object is an additive presentation summary; clients must continue to
treat `timerId`, `targetAtMs`, and the occurrence key as the identity contract.

## POST `/api/timer-attention`

The request body is one of the following strict action objects. A request may
contain at most 200 occurrences (encoded in `events`) or keys.

### Reconcile occurrences

```json
{
  "action": "create",
  "events": [
    {
      "projectId": "project_123",
      "timerId": "timer_123",
      "targetAtMs": "1784205600000",
      "crossedAt": "2026-07-16T10:00:00.000Z",
      "firstSeenAt": null,
      "acknowledgedAt": null,
      "deferredUntil": null,
      "policy": { "mode": "until-i-move-it", "minutes": null }
    }
  ]
}
```

The server derives `crossedAt` from `targetAtMs`, rejects recurring, archived,
future, moved, inaccessible, or unknown timers, and merges sign-in state using
the earliest non-null `firstSeenAt` and latest non-null `acknowledgedAt`.

### State actions

```json
{ "action": "markSeen", "projectId": "project_123", "keys": ["timer_123|1784205600000"] }
{ "action": "acknowledge", "projectId": "project_123", "keys": ["timer_123|1784205600000"] }
{ "action": "unacknowledge", "projectId": "project_123", "keys": ["timer_123|1784205600000"] }
{ "action": "close", "projectId": "project_123", "keys": ["timer_123|1784205600000"] }
{ "action": "defer", "projectId": "project_123", "keys": ["timer_123|1784205600000"], "untilMs": 1784209200000 }
{ "action": "defer", "projectId": "project_123", "keys": ["timer_123|1784205600000"], "untilMs": null }
```

`defer` with a timestamp starts from the moment of the action. `untilMs: null`
selects the indefinite policy. Delivery or dismissal of a browser notification
does not call any state action.

## Policy values

`policy.mode` is one of:

- `move-directly-to-past`
- `until-i-move-it`
- `after-seen-5m`
- `after-seen-15m`
- `after-seen-1h`
- `after-seen-1d`
- `custom`

Only `custom` carries a non-null integer `minutes` value (1 through 525600).
Occurrences with `firstSeenAt === null` never expire. Time-based expiry starts
at `firstSeenAt`, unless `deferredUntil` supplies the per-occurrence override.

## Errors and caching

- `401` when no signed-in user is available.
- `400 validation_error` for malformed strict action bodies.
- `429` for write-rate limiting.
- `503 storage_unavailable` when persistence is unavailable.

Successful responses use `Cache-Control: private, no-store`.
