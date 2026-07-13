import { chmod, lstat, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const PRIVATE_DIRECTORY_MODE = 0o700

async function assertPrivateOwnedDirectory(directory) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Smoke visual output must be a real directory: ${directory}`)
  }

  const currentUserId = process.getuid?.()
  if (currentUserId !== undefined && info.uid !== currentUserId) {
    throw new Error(`Smoke visual output must be owned by the current user: ${directory}`)
  }

  await chmod(directory, PRIVATE_DIRECTORY_MODE)
}

export async function prepareScreenshotDirectory(configuredDirectory) {
  if (configuredDirectory) {
    const directory = path.resolve(configuredDirectory)
    await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
    await assertPrivateOwnedDirectory(directory)
    return { path: directory, cleanup: async () => {} }
  }

  const directory = await mkdtemp(path.join(tmpdir(), "tickward-visual-smoke-"))
  await assertPrivateOwnedDirectory(directory)
  return {
    path: directory,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  }
}
