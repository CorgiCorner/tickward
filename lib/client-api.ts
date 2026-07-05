export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly type: string | null,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiRequestError"
  }
}

export async function readApiJson<T>(res: Response, fallback: string): Promise<T> {
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const type =
      data && typeof data === "object" && "error" in data
        ? ((data as { error?: { type?: unknown } }).error?.type ?? null)
        : null
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: { message?: unknown } }).error?.message ?? fallback)
        : fallback
    throw new ApiRequestError(message, typeof type === "string" ? type : null, res.status)
  }
  return data as T
}

export function apiUnavailableErrorMessage(error: unknown, unavailableMessage: string, fallbackMessage: string) {
  if (error instanceof ApiRequestError) {
    if (error.type === "storage_unavailable" || error.type === "rate_limit_unavailable" || error.status >= 500) {
      return unavailableMessage
    }
    return error.message
  }
  return fallbackMessage
}
