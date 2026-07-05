import { describe, expect, it } from "vitest"

import { ApiRequestError, apiUnavailableErrorMessage, readApiJson } from "@/lib/client-api"

describe("client-api", () => {
  it("returns parsed JSON for successful responses", async () => {
    await expect(readApiJson<{ ok: boolean }>(Response.json({ ok: true }), "Failed")).resolves.toEqual({ ok: true })
  })

  it("throws API request errors from error envelopes", async () => {
    await expect(
      readApiJson(
        Response.json({ error: { type: "validation_error", message: "Name is required." } }, { status: 400 }),
        "Failed",
      ),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      message: "Name is required.",
      status: 400,
      type: "validation_error",
    })
  })

  it("uses the fallback for failed responses without a JSON error envelope", async () => {
    await expect(readApiJson(new Response("not json", { status: 503 }), "Failed")).rejects.toMatchObject({
      message: "Failed",
      status: 503,
      type: null,
    })
  })

  it("maps storage, rate-limit, and server errors to unavailable messages", () => {
    expect(
      apiUnavailableErrorMessage(
        new ApiRequestError("Storage is unavailable.", "storage_unavailable", 503),
        "Unavailable",
        "Failed",
      ),
    ).toBe("Unavailable")
    expect(
      apiUnavailableErrorMessage(
        new ApiRequestError("Rate limit unavailable.", "rate_limit_unavailable", 503),
        "Unavailable",
        "Failed",
      ),
    ).toBe("Unavailable")
    expect(
      apiUnavailableErrorMessage(new ApiRequestError("Nope.", "validation_error", 500), "Unavailable", "Failed"),
    ).toBe("Unavailable")
    expect(
      apiUnavailableErrorMessage(
        new ApiRequestError("Name is required.", "validation_error", 400),
        "Unavailable",
        "Failed",
      ),
    ).toBe("Name is required.")
    expect(apiUnavailableErrorMessage(new Error("Network"), "Unavailable", "Failed")).toBe("Failed")
  })
})
