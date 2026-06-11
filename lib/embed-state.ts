// Embed state derivation (contract section 1.2 / 2).
//
// Product rule (proposed answer to contract open question 3): counting up
// from a past date is first-class app behavior, so a one-shot timer whose
// target is already in the past resolves to "since" - matching the share
// page. "finished" is a client-side transient: it renders only when the
// countdown crosses zero while the embed is mounted, and becomes "since"
// on the next load. The server therefore never emits "finished" today; the
// enum keeps it so the rule can change additively (consumers must treat
// unknown states as "unavailable" per contract section 4).

export const EMBED_STATES = ["counting", "since", "finished", "unavailable"] as const
export type EmbedState = (typeof EMBED_STATES)[number]

export type ResolvedEmbedState = Extract<EmbedState, "counting" | "since">

export function deriveEmbedState(targetDateIsoUtc: string, nowMs: number): ResolvedEmbedState {
  const targetMs = new Date(targetDateIsoUtc).getTime()
  return Number.isFinite(targetMs) && targetMs > nowMs ? "counting" : "since"
}
