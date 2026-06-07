import { redirectToDocsSubpath } from "@/lib/docs-redirect.server"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return redirectToDocsSubpath(req, "/skill.md")
}
