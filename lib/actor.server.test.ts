import { describe, expect, it } from "vitest"

import { getCurrentActor } from "./actor.server"

describe("getCurrentActor", () => {
  it("returns an anonymous actor carrying the restore key", async () => {
    const actor = await getCurrentActor({ restoreKey: "restoreKey_123" })

    expect(actor).toEqual({ kind: "anonymous", restoreKey: "restoreKey_123" })
  })
})
