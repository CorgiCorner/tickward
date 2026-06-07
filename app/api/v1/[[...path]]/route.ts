import { handlePublicApiV1Request } from "@/lib/public-api-v1.server"

export const runtime = "nodejs"

type ApiV1RouteContext = {
  params: Promise<{ path?: string[] }>
}

async function route(method: string, req: Request, context: ApiV1RouteContext) {
  const params = await context.params
  return handlePublicApiV1Request(method, req, params.path ?? [])
}

export async function GET(req: Request, context: ApiV1RouteContext) {
  return route("GET", req, context)
}

export async function POST(req: Request, context: ApiV1RouteContext) {
  return route("POST", req, context)
}

export async function PATCH(req: Request, context: ApiV1RouteContext) {
  return route("PATCH", req, context)
}

export async function DELETE(req: Request, context: ApiV1RouteContext) {
  return route("DELETE", req, context)
}
