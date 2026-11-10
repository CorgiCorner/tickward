import "server-only"

/** What rate-limit keys see when no trusted proxy names the caller. */
export const UNKNOWN_CLIENT_IP = "unknown"

const CLIENT_IP_HEADERS = new Set(["x-forwarded-for", "x-real-ip", "cf-connecting-ip"])

/**
 * The caller's IP for rate-limit keys. Proxy headers are only trusted when the deployment says it
 * sits behind one (TICKWARD_TRUST_PROXY_HEADERS), and then only ONE header is read: the one the
 * deployment's proxy sets or overwrites, named by TICKWARD_CLIENT_IP_HEADER (default
 * x-forwarded-for). Reading several would let a client supply a header the proxy passes through
 * untouched. From X-Forwarded-For only the rightmost hop counts, the one the trusted proxy
 * appended. Anything else is UNKNOWN_CLIENT_IP; callers must not make every such caller share one
 * tight bucket.
 */
export function trustedClientIp(req: Request, env: NodeJS.ProcessEnv = process.env) {
  const trusted = env.TICKWARD_TRUST_PROXY_HEADERS === "true" || env.TRUST_PROXY_HEADERS === "true"
  if (!trusted) return UNKNOWN_CLIENT_IP
  const configured = env.TICKWARD_CLIENT_IP_HEADER?.trim().toLowerCase() || "x-forwarded-for"
  if (!CLIENT_IP_HEADERS.has(configured)) return UNKNOWN_CLIENT_IP
  const value = req.headers.get(configured)
  if (configured !== "x-forwarded-for") return value?.trim() || UNKNOWN_CLIENT_IP
  return (
    value
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1) ?? UNKNOWN_CLIENT_IP
  )
}
