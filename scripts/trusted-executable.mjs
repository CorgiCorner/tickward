import { accessSync, constants, realpathSync, statSync } from "node:fs"
import path from "node:path"

function pathComponents(directory) {
  const components = []
  let current = directory
  while (true) {
    components.push(current)
    const parent = path.dirname(current)
    if (parent === current) return components
    current = parent
  }
}

function isTrustedDirectory(directory, uid) {
  try {
    const resolved = realpathSync(directory)
    return pathComponents(resolved).every((component) => {
      const stats = statSync(component)
      if (!stats.isDirectory()) return false
      if (uid !== null && stats.uid !== 0 && stats.uid !== uid) return false
      return (stats.mode & 0o022) === 0
    })
  } catch {
    return false
  }
}

function executableNames(name, platform, pathExt) {
  if (platform !== "win32") return [name]
  if (path.extname(name)) return [name]
  return pathExt
    .split(";")
    .filter(Boolean)
    .map((extension) => `${name}${extension.toLowerCase()}`)
}

function trustedExecutable(candidate, uid) {
  if (!path.isAbsolute(candidate)) return null
  try {
    accessSync(candidate, constants.X_OK)
    const resolved = realpathSync(candidate)
    if (!statSync(resolved).isFile()) return null
    if (!isTrustedDirectory(path.dirname(candidate), uid)) return null
    if (!isTrustedDirectory(path.dirname(resolved), uid)) return null
    return resolved
  } catch {
    return null
  }
}

/**
 * Resolve an executable without trusting relative, foreign-owned, or
 * group/world-writable PATH entries. Owner-writable directories are allowed:
 * a process running as that owner can already replace its environment and
 * executable inputs, while other local principals must not be able to do so.
 */
export function resolveTrustedExecutable(
  name,
  {
    candidates = [],
    pathValue = process.env.PATH ?? "",
    platform = process.platform,
    pathExt = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD",
    uid = typeof process.getuid === "function" ? process.getuid() : null,
  } = {},
) {
  const names = executableNames(name, platform, pathExt)
  const locations = [
    ...candidates,
    ...pathValue
      .split(path.delimiter)
      .filter((directory) => path.isAbsolute(directory) && isTrustedDirectory(directory, uid))
      .flatMap((directory) => names.map((executable) => path.join(directory, executable))),
  ]

  for (const location of locations) {
    const resolved = trustedExecutable(location, uid)
    if (resolved) return resolved
  }

  throw new Error(`Unable to resolve ${name} from a trusted executable directory.`)
}
