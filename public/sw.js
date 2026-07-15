const NOTIFICATION_OPTION_KEYS = new Set(["body", "tag"])

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

globalThis.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    globalThis.clients.matchAll({ type: "window" }).then((list) => {
      if (list.length) return list[0].focus()
      return globalThis.clients.openWindow("/")
    }),
  )
})
