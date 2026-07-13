import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"

/**
 * Normalizes a value to its JSON wire format before it is stored in a Prisma JSON column.
 *
 * The JSON round-trip is intentional and must not be replaced with `structuredClone`:
 * persisted payloads rely on JSON serialization semantics — `Date` values become ISO
 * strings (via `toJSON`), `undefined` properties are dropped, and functions, symbols,
 * and prototypes are stripped. `structuredClone` would keep `Date`/`Map`/`Set` instances
 * (which are not valid `Prisma.InputJsonValue`) and throw on functions.
 */
export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue // NOSONAR typescript:S7784 — JSON normalization is the intent, not deep cloning
}
