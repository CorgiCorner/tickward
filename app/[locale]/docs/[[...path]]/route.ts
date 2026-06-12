import { redirectToDocs } from "@/lib/docs-redirect.server"

export const runtime = "nodejs"

type DocsRouteContext = {
  params: Promise<{ path?: string[] }>
}

export async function GET(req: Request, context: DocsRouteContext) {
  const params = await context.params
  return redirectToDocs(req, `/${params.path?.join("/") ?? ""}`)
}
