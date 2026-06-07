globalThis.addEventListener("message", (event) => {
  if (event.origin !== globalThis.location.origin || event.data?.type !== "SHOW_NOTIFICATION") return

  const title = typeof event.data.title === "string" ? event.data.title : "Tickward"
  const options = typeof event.data.options === "object" && event.data.options !== null ? event.data.options : undefined

  event.waitUntil(globalThis.registration.showNotification(title, options))
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
