const canonicalProjectPathBrand: unique symbol = Symbol("CanonicalProjectPath")
const projectRelativePathBrand: unique symbol = Symbol("ProjectRelativePath")
const buildIdBrand: unique symbol = Symbol("BuildId")
const revisionHashBrand: unique symbol = Symbol("RevisionHash")

export type CanonicalProjectPath = string & {
  readonly [canonicalProjectPathBrand]: true
}
export type ProjectRelativePath = string & {
  readonly [projectRelativePathBrand]: true
}
export type BuildId = string & { readonly [buildIdBrand]: true }
export type RevisionHash = string & { readonly [revisionHashBrand]: true }

/** Establishes the absolute-path invariant after Rust has canonicalized a root. */
export function canonicalProjectPath(value: string): CanonicalProjectPath {
  if (!isAbsolutePath(value)) throw new TypeError("Project path is not absolute")
  // The runtime predicate above is the constructor for this opaque scalar.
  return value as CanonicalProjectPath
}

/** Establishes one normalized, traversal-free project-relative wire path. */
export function projectRelativePath(value: string): ProjectRelativePath {
  const normalized = value.replaceAll("\\", "/")
  const components = normalized.split("/")
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    components.some((component) =>
      component === "" || component === "." || component === ".."
    )
  )
    throw new TypeError("Project-relative path is invalid")
  // The normalized component proof above is unavailable to TypeScript's type system.
  return normalized as ProjectRelativePath
}

/** Establishes the bounded run-identity shape emitted by the Rust controller. */
export function buildId(value: string): BuildId {
  if (!/^\d+-\d+$/.test(value)) throw new TypeError("Build ID is invalid")
  return value as BuildId
}

/** Establishes the exact SHA-256 wire representation used for source revisions. */
export function revisionHash(value: string): RevisionHash {
  if (!/^[\dA-Fa-f]{64}$/.test(value)) throw new TypeError("Revision hash is invalid")
  return value as RevisionHash
}

function isAbsolutePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(value)
  )
}
