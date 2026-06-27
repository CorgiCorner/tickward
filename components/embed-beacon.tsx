// No-op in the open core. The embed page mounts this component but ships no
// analytics by default; a self-hosted build can render its own beacon here.
export function EmbedBeacon(_props: Readonly<{ token: string }>) {
  return null
}
