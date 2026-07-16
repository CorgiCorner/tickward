import { readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { describe, expect, it, vi } from "vitest"

const workerSource = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8")

function loadWorker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const focus = vi.fn().mockResolvedValue(undefined)
  const postMessage = vi.fn()
  const matchAll = vi.fn().mockResolvedValue([{ focus, postMessage }])
  const openWindow = vi.fn().mockResolvedValue(null)
  const getClient = vi.fn().mockResolvedValue({
    id: "owned-window",
    type: "window",
    url: "https://tickward.test/en",
  })
  const workerGlobal = {
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) =>
      listeners.set(type, listener),
    clients: { get: getClient, matchAll, openWindow },
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

  async function dispatchNotificationClick(overrides: Record<string, unknown> = {}) {
    const waitUntil = vi.fn()
    const close = vi.fn()
    listeners.get("notificationclick")?.({
      action: "view",
      notification: {
        close,
        data: {
          kind: "timer",
          projectId: "project-a",
          timerId: "timer-1",
          targetAtMs: 1_769_299_200_000,
        },
      },
      waitUntil,
      ...overrides,
    })
    if (waitUntil.mock.calls[0]?.[0]) await waitUntil.mock.calls[0][0]
    return { close, waitUntil }
  }

  return {
    dispatchMessage,
    dispatchNotificationClick,
    focus,
    getClient,
    matchAll,
    openWindow,
    postMessage,
    showNotification,
  }
}

describe("service worker notification messages", () => {
  it("shows a bounded notification from an owned same-origin window", async () => {
    const { dispatchMessage, getClient, showNotification } = loadWorker()

    await dispatchMessage()

    expect(getClient).toHaveBeenCalledWith("owned-window")
    expect(showNotification).toHaveBeenCalledWith("Timer finished", { body: "Launch", tag: "timer-1" })
  })

  it("forwards validated notification actions and occurrence data", async () => {
    const { dispatchMessage, showNotification } = loadWorker()
    const options = {
      actions: [
        { action: "view", title: "View" },
        { action: "acknowledge", title: "Acknowledge" },
      ],
      body: "Launch started counting up in Marketing",
      data: {
        kind: "timer",
        projectId: "project-a",
        timerId: "timer-1",
        targetAtMs: 1_769_299_200_000,
      },
      tag: "timer-1",
    }

    await dispatchMessage({ data: { type: "SHOW_NOTIFICATION", title: "Timer finished", options } })

    expect(showNotification).toHaveBeenCalledWith("Timer finished", options)
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

  it("focuses the app and forwards View or Acknowledge only after a notification click", async () => {
    const worker = loadWorker()

    const { close } = await worker.dispatchNotificationClick({ action: "acknowledge" })

    expect(close).toHaveBeenCalledTimes(1)
    expect(worker.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true })
    expect(worker.focus).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "TIMER_ATTENTION_NOTIFICATION_ACTION",
      kind: "timer",
      action: "acknowledge",
      projectId: "project-a",
      timerId: "timer-1",
      targetAtMs: 1_769_299_200_000,
    })
  })

  it("routes every coalesced notification click to the global review", async () => {
    const worker = loadWorker()
    await worker.dispatchNotificationClick({
      action: "acknowledge",
      notification: {
        close: vi.fn(),
        data: { kind: "review", projectCount: 3 },
      },
    })

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "TIMER_ATTENTION_NOTIFICATION_ACTION",
      kind: "review",
      action: "review",
    })
  })

  it("persists a cold-start target in the opened URL instead of posting before listeners exist", async () => {
    const worker = loadWorker()
    worker.matchAll.mockResolvedValue([])
    worker.openWindow.mockResolvedValue({ focus: worker.focus, postMessage: worker.postMessage })

    await worker.dispatchNotificationClick({ action: "acknowledge" })

    expect(worker.openWindow).toHaveBeenCalledWith(
      "/#attention=timer&action=acknowledge&projectId=project-a&timerId=timer-1&targetAtMs=1769299200000",
    )
    expect(worker.focus).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).not.toHaveBeenCalled()
  })

  it("does not change attention state when a notification is merely delivered", async () => {
    const worker = loadWorker()

    await worker.dispatchMessage()

    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(worker.focus).not.toHaveBeenCalled()
  })
})
