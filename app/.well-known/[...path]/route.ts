import { redirectToDocs } from "@/lib/docs-redirect.server"

export const runtime = "nodejs"

type WellKnownRouteContext = {
  params: Promise<{ path: string[] }>
}

export async function GET(req: Request, context: WellKnownRouteContext) {
  const params = await context.params
  return redirectToDocs(req, `/.well-known/${params.path.join("/")}`)
}
