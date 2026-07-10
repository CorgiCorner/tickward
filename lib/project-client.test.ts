import { afterEach, describe, expect, it, vi } from "vitest"

import {
  claimProject,
  clearProject,
  clearUserProject,
  listUserProjects,
  projectCloudClient,
  restoreProject,
  restoreUserProject,
  saveProject,
} from "@/lib/project-client"
import { PUBLIC_ERROR_CODES, createPublicError } from "@/lib/public-errors"
import { makeProjectSnapshot } from "@/test/factories"

function stubFetch(impl: typeof fetch) {
  const mock = vi.fn(impl)
  vi.stubGlobal("fetch", mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("saveProject", () => {
  it("POSTs the exact save payload and maps ok responses to saved", async () => {
    const project = makeProjectSnapshot()
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))

    const result = await saveProject({
      key: "key_123",
      project,
      baseUpdatedAt: "2026-05-20T00:00:00.000Z",
      force: false,
    })

    expect(result).toEqual({ status: "saved" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/save")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toEqual({ "content-type": "application/json" })
    expect(JSON.parse(init?.body as string)).toEqual({
      key: "key_123",
      project,
      baseUpdatedAt: "2026-05-20T00:00:00.000Z",
      force: false,
    })
  })

  it("omits baseUpdatedAt when force is true", async () => {
    const project = makeProjectSnapshot()
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))

    await saveProject({ key: "key_123", project, baseUpdatedAt: "2026-05-20T00:00:00.000Z", force: true })

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body).toEqual({ key: "key_123", project, force: true })
    expect("baseUpdatedAt" in body).toBe(false)
  })

  it("can save account-backed projects by project id", async () => {
    const project = makeProjectSnapshot()
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))

    await saveProject({ projectId: "project_123", project, baseUpdatedAt: undefined, force: false })

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body).toEqual({
      projectId: "project_123",
      project,
      force: false,
    })
  })

  it("maps a 409 into a conflict carrying the remote project and source", async () => {
    const remote = makeProjectSnapshot({ updatedAt: "2026-05-24T10:00:00.000Z" })
    stubFetch(async () => Response.json({ project: remote, source: "legacy" }, { status: 409 }))

    const result = await saveProject({ key: "key_123", project: remote, baseUpdatedAt: undefined, force: false })

    expect(result).toEqual({ status: "conflict", project: remote, source: "legacy" })
  })

  it("defaults the conflict source to project when the body omits it", async () => {
    const remote = makeProjectSnapshot()
    stubFetch(async () => Response.json({ project: remote }, { status: 409 }))

    const result = await saveProject({ key: "key_123", project: remote, baseUpdatedAt: undefined, force: false })

    expect(result).toEqual({ status: "conflict", project: remote, source: "project" })
  })

  it("maps 404 save responses into not_found", async () => {
    stubFetch(async () => new Response("Not found.", { status: 404 }))

    const result = await saveProject({
      key: "key_123",
      project: makeProjectSnapshot(),
      baseUpdatedAt: undefined,
      force: false,
    })

    expect(result).toEqual({ status: "not_found" })
  })

  it("formats public API errors on non-ok, non-409 responses", async () => {
    stubFetch(async () =>
      Response.json(
        { error: createPublicError(PUBLIC_ERROR_CODES.invalidRestoreKey, "errors.invalidRestoreKey") },
        { status: 400 },
      ),
    )

    await expect(
      saveProject({ key: "key_123", project: makeProjectSnapshot(), baseUpdatedAt: undefined, force: false }),
    ).rejects.toThrow("Invalid restore key.")
  })

  it("falls back to a public save message when the error body is empty", async () => {
    stubFetch(async () => new Response("", { status: 503 }))

    await expect(
      saveProject({ key: "key_123", project: makeProjectSnapshot(), baseUpdatedAt: undefined, force: false }),
    ).rejects.toThrow("Save failed.")
  })

  it("propagates network errors", async () => {
    stubFetch(async () => {
      throw new Error("network down")
    })

    await expect(
      saveProject({ key: "key_123", project: makeProjectSnapshot(), baseUpdatedAt: undefined, force: false }),
    ).rejects.toThrow("network down")
  })
})

describe("restoreProject", () => {
  it("GETs the encoded key with no-store and returns the parsed payload", async () => {
    const project = makeProjectSnapshot()
    const fetchMock = stubFetch(async () => Response.json({ project, source: "project" }))

    const result = await restoreProject("key/with space")

    expect(result).toEqual({ status: "ok", data: { project, source: "project" } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/restore?key=key%2Fwith%20space")
    expect(init?.method).toBe("GET")
    expect(init?.cache).toBe("no-store")
  })

  it("maps a 404 into not_found", async () => {
    stubFetch(async () => new Response("Not found.", { status: 404 }))

    const result = await restoreProject("key_123")

    expect(result).toEqual({ status: "not_found" })
  })

  it("throws a safe fallback for unstructured non-ok responses", async () => {
    stubFetch(async () => new Response("invalid key", { status: 400 }))

    await expect(restoreProject("key_123")).rejects.toThrow("Restore failed.")
  })

  it("propagates network errors", async () => {
    stubFetch(async () => {
      throw new Error("offline")
    })

    await expect(restoreProject("key_123")).rejects.toThrow("offline")
  })
})

describe("restoreUserProject", () => {
  it("GETs the encoded project id and returns the parsed payload", async () => {
    const project = makeProjectSnapshot()
    const fetchMock = stubFetch(async () => Response.json({ project, source: "project", projectId: "project_123" }))

    const result = await restoreUserProject("project/123")

    expect(result).toEqual({ status: "ok", data: { project, source: "project", projectId: "project_123" } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/restore?projectId=project%2F123")
    expect(init?.method).toBe("GET")
    expect(init?.cache).toBe("no-store")
  })

  it("maps user project auth and availability status responses", async () => {
    stubFetch(async () => new Response("Sign in.", { status: 401 }))
    await expect(restoreUserProject("project_123")).resolves.toEqual({ status: "unauthenticated" })

    stubFetch(async () => new Response("Not configured.", { status: 501 }))
    await expect(restoreUserProject("project_123")).resolves.toEqual({ status: "unsupported" })

    stubFetch(async () => new Response("Not found.", { status: 404 }))
    await expect(restoreUserProject("project_123")).resolves.toEqual({ status: "not_found" })
  })
})

describe("listUserProjects", () => {
  it("GETs the signed-in project list and returns summaries", async () => {
    const projects = [
      {
        projectId: "project_123",
        name: "Main",
        ownerId: "user_123",
        createdAt: "2026-06-05T20:50:40.519Z",
        updatedAt: "2026-06-05T21:11:37.795Z",
        timerCount: 16,
        spaceCount: 1,
      },
    ]
    const fetchMock = stubFetch(async () => Response.json({ projects }))

    const result = await listUserProjects()

    expect(result).toEqual({ status: "ok", projects })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/list")
    expect(init?.method).toBe("GET")
    expect(init?.cache).toBe("no-store")
  })

  it("maps list status responses", async () => {
    stubFetch(async () => new Response("Sign in.", { status: 401 }))
    await expect(listUserProjects()).resolves.toEqual({ status: "unauthenticated" })

    stubFetch(async () => new Response("Not configured.", { status: 501 }))
    await expect(listUserProjects()).resolves.toEqual({ status: "unsupported" })

    stubFetch(async () => new Response("Not found.", { status: 404 }))
    await expect(listUserProjects()).resolves.toEqual({ status: "not_found" })
  })
})

describe("clearProject", () => {
  it("DELETEs the encoded key", async () => {
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))

    await clearProject("key/123")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/clear?key=key%2F123")
    expect(init?.method).toBe("DELETE")
  })

  it("throws a safe fallback on unstructured non-ok responses", async () => {
    stubFetch(async () => new Response("nope", { status: 500 }))

    await expect(clearProject("key_123")).rejects.toThrow("Delete failed.")
  })

  it("propagates network errors", async () => {
    stubFetch(async () => {
      throw new Error("dropped")
    })

    await expect(clearProject("key_123")).rejects.toThrow("dropped")
  })
})

describe("clearUserProject", () => {
  it("DELETEs the encoded project id", async () => {
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))

    await clearUserProject("project/123")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/clear?projectId=project%2F123")
    expect(init?.method).toBe("DELETE")
  })
})

describe("claimProject", () => {
  it("POSTs the restore key and maps claimed responses", async () => {
    const project = {
      projectId: "project_123",
      project: makeProjectSnapshot(),
      owner: { id: "user_123", email: "ada@example.com" },
      claimedAt: "2026-06-05T08:00:00.000Z",
    }
    const fetchMock = stubFetch(async () => Response.json({ project }))

    const result = await claimProject("restoreKey_123")

    expect(result).toEqual({ status: "claimed", project, overLimit: false })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/claim")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toEqual({ "content-type": "application/json" })
    expect(JSON.parse(init?.body as string)).toEqual({ restoreKey: "restoreKey_123" })
  })

  it("maps claim status responses", async () => {
    stubFetch(async () => Response.json({ error: "Sign in." }, { status: 401 }))
    await expect(claimProject("restoreKey_123")).resolves.toEqual({ status: "unauthenticated" })

    stubFetch(async () => Response.json({ error: "Not configured." }, { status: 501 }))
    await expect(claimProject("restoreKey_123")).resolves.toEqual({ status: "unsupported" })

    stubFetch(async () => new Response("Not found.", { status: 404 }))
    await expect(claimProject("restoreKey_123")).resolves.toEqual({ status: "not_found" })
  })

  it("throws useful errors for unexpected claim failures", async () => {
    stubFetch(async () => new Response("", { status: 500 }))

    await expect(claimProject("restoreKey_123")).rejects.toThrow("Project claim failed.")
  })
})

describe("projectCloudClient", () => {
  it("exposes every project cloud operation behind one facade", () => {
    expect(projectCloudClient).toEqual({
      saveProject,
      restoreProject,
      restoreUserProject,
      listUserProjects,
      clearProject,
      clearUserProject,
      claimProject,
    })
  })
})
