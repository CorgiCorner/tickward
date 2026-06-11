import type { NextConfig } from "next"

import { getWwwToApexRedirect } from "./lib/site-config"

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./prisma/rds-ca.pem", "./skill.md"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async redirects() {
    const wwwToApex = getWwwToApexRedirect()
    return wwwToApex ? [wwwToApex] : []
  },
  async headers() {
    const sharedSecurityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]
    return [
      {
        // Everything except /embed/* stays unframeable.
        source: "/((?!embed/).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }, ...sharedSecurityHeaders],
      },
      {
        // Embeds exist to be framed by third-party sites.
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }, ...sharedSecurityHeaders],
      },
    ]
  },
}

export default nextConfig
