// Explicit handling for intentional fire-and-forget async work. Shared by
// server and client code, so it must stay dependency-free.

/**
 * Runs an already-started async task in the background without blocking the
 * caller. An error handler is always attached, so a rejected task is logged
 * under its context tag instead of surfacing as an unhandled promise
 * rejection. Accepts a missing task so optional callbacks can be passed
 * through directly.
 */
export function runInBackground(context: string, task: Promise<unknown> | null | undefined): void {
  task?.catch((error: unknown) => {
    console.error(`[tickward] ${context}`, error)
  })
}
