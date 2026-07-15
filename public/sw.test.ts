import { readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { describe, expect, it, vi } from "vitest"

const workerSource = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8")

function loadWorker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const getClient = vi.fn().mockResolvedValue({
    id: "owned-window",
    type: "window",
    url: "https://tickward.test/en",
  })
  const workerGlobal = {
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) =>
      listeners.set(type, listener),
    clients: { get: getClient, matchAll: vi.fn(), openWindow: vi.fn() },
    location: { origin: "https://tickward.test" },
    registration: { showNotification },
  }

  vm.runInNewContext(workerSource, { globalThis: workerGlobal, Set, URL })

  async function dispatchMessage(overrides: Record<string, unknown> = {}) {
    const waitUntil = vi.fn()
    listeners.get("message")?.({
      data: { type: "SHOW_NOTIFICATION", title: "Timer finished", options: { body: "Launch", tag: "timer-1" } },
      origin: "https://tickward.test",
      source: { id: "owned-window" },
      waitUntil,
      ...overrides,
    })
    if (waitUntil.mock.calls[0]?.[0]) await waitUntil.mock.calls[0][0]
    return waitUntil
  }

  return { dispatchMessage, getClient, showNotification }
}

describe("service worker notification messages", () => {
  it("shows a bounded notification from an owned same-origin window", async () => {
    const { dispatchMessage, getClient, showNotification } = loadWorker()

    await dispatchMessage()

    expect(getClient).toHaveBeenCalledWith("owned-window")
    expect(showNotification).toHaveBeenCalledWith("Timer finished", { body: "Launch", tag: "timer-1" })
  })

  it("rejects cross-origin and missing-source messages", async () => {
    const crossOrigin = loadWorker()
    await crossOrigin.dispatchMessage({ origin: "https://attacker.test" })
    expect(crossOrigin.showNotification).not.toHaveBeenCalled()

    const missingSource = loadWorker()
    await missingSource.dispatchMessage({ source: null })
    expect(missingSource.showNotification).not.toHaveBeenCalled()

    const missingOrigin = loadWorker()
    await missingOrigin.dispatchMessage({ origin: "" })
    expect(missingOrigin.showNotification).not.toHaveBeenCalled()
  })

  it("rejects non-window and unowned clients", async () => {
    const wrongType = loadWorker()
    wrongType.getClient.mockResolvedValue({ id: "owned-window", type: "worker", url: "https://tickward.test" })
    await wrongType.dispatchMessage()
    expect(wrongType.showNotification).not.toHaveBeenCalled()

    const missingClient = loadWorker()
    missingClient.getClient.mockResolvedValue(undefined)
    await missingClient.dispatchMessage()
    expect(missingClient.showNotification).not.toHaveBeenCalled()
  })

  it("rejects wrong message types and malformed payloads", async () => {
    const wrongType = loadWorker()
    const waitUntil = await wrongType.dispatchMessage({ data: { type: "OTHER", title: "Timer finished" } })
    expect(waitUntil).not.toHaveBeenCalled()

    const malformed = loadWorker()
    await malformed.dispatchMessage({
      data: { type: "SHOW_NOTIFICATION", title: "Timer finished", options: { data: { redirect: "/admin" } } },
    })
    expect(malformed.showNotification).not.toHaveBeenCalled()
  })
})
