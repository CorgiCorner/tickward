const NOTIFICATION_OPTION_KEYS = new Set(["actions", "body", "data", "tag"])
const NOTIFICATION_ACTIONS = new Set(["acknowledge", "view"])

function boundedString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null
}

function notificationPayload(data) {
  if (!data || typeof data !== "object" || data.type !== "SHOW_NOTIFICATION") return null
  const title = boundedString(data.title, 200)
  if (!title) return null

  const rawOptions = data.options ?? {}
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) return null
  if (Object.keys(rawOptions).some((key) => !NOTIFICATION_OPTION_KEYS.has(key))) return null

  const options = {}
  if (rawOptions.body !== undefined) {
    const body = boundedString(rawOptions.body, 500)
    if (!body) return null
    options.body = body
  }
  if (rawOptions.tag !== undefined) {
    const tag = boundedString(rawOptions.tag, 128)
    if (!tag) return null
    options.tag = tag
  }
  if (rawOptions.actions !== undefined) {
    if (!Array.isArray(rawOptions.actions) || rawOptions.actions.length === 0 || rawOptions.actions.length > 2) {
      return null
    }
    const actions = rawOptions.actions.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      if (Object.keys(item).some((key) => key !== "action" && key !== "title")) return null
      const action = boundedString(item.action, 32)
      const title = boundedString(item.title, 100)
      if (!action || !title || !NOTIFICATION_ACTIONS.has(action)) return null
      return { action, title }
    })
    if (actions.some((action) => action === null)) return null
    options.actions = actions
  }
  if (rawOptions.data !== undefined) {
    const rawData = rawOptions.data
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null
    if (rawData.kind === "timer") {
      if (
        Object.keys(rawData).some(
          (key) => key !== "kind" && key !== "projectId" && key !== "timerId" && key !== "targetAtMs",
        )
      ) {
        return null
      }
      const projectId = boundedString(rawData.projectId, 200)
      const timerId = boundedString(rawData.timerId, 200)
      const targetAtMs = rawData.targetAtMs
      if (
        !projectId ||
        !timerId ||
        typeof targetAtMs !== "number" ||
        !Number.isSafeInteger(targetAtMs) ||
        targetAtMs < 0
      ) {
        return null
      }
      options.data = { kind: "timer", projectId, timerId, targetAtMs }
    } else if (rawData.kind === "review") {
      if (Object.keys(rawData).some((key) => key !== "kind" && key !== "projectCount")) return null
      const projectCount = rawData.projectCount
      if (!Number.isSafeInteger(projectCount) || projectCount < 1) return null
      options.data = { kind: "review", projectCount }
    } else {
      return null
    }
  }

  return { title, options }
}

async function showOwnedClientNotification(event) {
  const sourceId = event.source?.id
  if (typeof sourceId !== "string" || !sourceId) return

  const source = await globalThis.clients.get(sourceId)
  if (source?.type !== "window") return

  let sourceOrigin
  try {
    sourceOrigin = new URL(source.url).origin
  } catch {
    return
  }
  if (sourceOrigin !== globalThis.location.origin) return

  const payload = notificationPayload(event.data)
  if (!payload) return

  await globalThis.registration.showNotification(payload.title, payload.options)
}

globalThis.addEventListener("message", (event) => {
  if (event.data?.type !== "SHOW_NOTIFICATION") return
  if (event.origin !== globalThis.location.origin || !event.source) return
  event.waitUntil(showOwnedClientNotification(event))
})

async function openAttentionNotification(event) {
  const data = event.notification.data
  const message =
    data?.kind === "review"
      ? { type: "TIMER_ATTENTION_NOTIFICATION_ACTION", kind: "review", action: "review" }
      : {
          type: "TIMER_ATTENTION_NOTIFICATION_ACTION",
          kind: "timer",
          action: NOTIFICATION_ACTIONS.has(event.action) ? event.action : "view",
          projectId: data?.projectId,
          timerId: data?.timerId,
          targetAtMs: data?.targetAtMs,
        }
  const list = await globalThis.clients.matchAll({ type: "window", includeUncontrolled: true })
  const openUrl =
    data?.kind === "review"
      ? "/#attention=review"
      : `/#attention=timer&action=${encodeURIComponent(message.action)}&projectId=${encodeURIComponent(
          data?.projectId ?? "",
        )}&timerId=${encodeURIComponent(data?.timerId ?? "")}&targetAtMs=${encodeURIComponent(
          String(data?.targetAtMs ?? ""),
        )}`
  const existingClient = list[0]
  const client = existingClient ?? (await globalThis.clients.openWindow(openUrl))
  if (!client) return
  await client.focus()
  if (existingClient) client.postMessage(message)
}

globalThis.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(openAttentionNotification(event))
})
