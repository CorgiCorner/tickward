import { buildRobotsTxt } from "@/lib/robots-txt"

export const runtime = "nodejs"

export function GET() {
  return new Response(buildRobotsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}
