import type { NextConfig } from "next"

import { getWwwToApexRedirect } from "./lib/site-config"

const nextConfig: NextConfig = {
  // Emit browser source maps in production so client error stacks (in devtools
  // and in the Sentry monitor) point at real source instead of minified chunks.
  // The app source is public (tickward-public is open source), so there is
  // nothing to hide by shipping the maps.
  productionBrowserSourceMaps: true,
  experimental: {
    // Required for app/global-not-found.tsx: routing-level 404s render a
    // standalone branded document with a real 404 status.
    globalNotFound: true,
  },
  outputFileTracingIncludes: {
    "/*": ["./prisma/rds-ca.pem", "./skill.md"],
  },
  // Drop the sharp image optimizer (~16 MB) from the serverless trace. Every
  // remote/dynamic image (CDN illustrations, Unsplash cards + picker) already
  // renders with `unoptimized`; the only optimizer-eligible images are small
  // static press screenshots. Disabling the optimizer keeps the Amplify build
  // output under the 220 MiB compute cap.
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**"],
  },
  images: {
    unoptimized: true,
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
