import type {
  ProjectEntry,
  ProjectSummary,
  RootCandidate,
  RootEvidence,
} from "@/domain/project"

const readableSourceExtensions = new Set([
  "tex",
  "bib",
  "sty",
  "cls",
  "txt",
  "md",
])

export type ProjectTreeNode = ProjectEntry & { path: string }

export type TexDependencyKind = "source" | "bibliography" | "asset" | "package"

export type TexDependency = {
  command: string
  kind: TexDependencyKind
  path: string
}

export function projectTreeNodes(
  entry: ProjectEntry,
  parentPath = ""
): ProjectTreeNode[] {
  return entry.children.map((child) => ({
    ...child,
    path: parentPath === "" ? child.name : `${parentPath}/${child.name}`,
  }))
}

export function isReadableSource(path: string): boolean {
  const extension = path.split(".").pop()?.toLocaleLowerCase()
  return extension !== undefined && readableSourceExtensions.has(extension)
}

/** Extracts direct file references from common LaTeX commands without resolving TeX's full macro language. */
export function texDependencies(source: string, sourcePath: string): TexDependency[] {
  const dependencies: TexDependency[] = []
  const seen = new Set<string>()
  const sourceDirectory = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
    : ""
  const uncommented = source
    .split("\n")
    .map((line) => line.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n")
  const commandPattern = /\\(input|include|subfile|bibliography|addbibresource|includegraphics|usepackage|documentclass)\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/g

  for (const match of uncommented.matchAll(commandPattern)) {
    const command = match[1]
    const values = match[2].split(",").map((value) => value.trim()).filter(Boolean)
    for (const value of values) {
      const kind = dependencyKind(command)
      const path = dependencyPath(value, sourceDirectory, kind)
      const key = `${command}:${path}`
      if (!seen.has(key)) {
        seen.add(key)
        dependencies.push({ command, kind, path })
      }
    }
  }
  return dependencies
}

function dependencyKind(command: string): TexDependencyKind {
  if (["input", "include", "subfile"].includes(command)) return "source"
  if (["bibliography", "addbibresource"].includes(command)) return "bibliography"
  if (command === "includegraphics") return "asset"
  return "package"
}

function dependencyPath(
  value: string,
  sourceDirectory: string,
  kind: TexDependencyKind
): string {
  const extension =
    kind === "source" ? ".tex" : kind === "bibliography" ? ".bib" : ""
  const path = extension !== "" && !value.includes(".") ? `${value}${extension}` : value
  if (kind === "package") return path
  return sourceDirectory === "" ? path : `${sourceDirectory}/${path}`
}

export function preferredRoot(
  project: ProjectSummary,
  persistedRoot: string | null
): string | null {
  if (persistedRoot !== null && treeContainsPath(project.tree, persistedRoot)) {
    return persistedRoot
  }
  return project.rootCandidates.length === 1
    ? project.rootCandidates[0].path
    : null
}

export function preferredSourceFile(
  project: ProjectSummary,
  persistedFile: string | null,
  selectedRoot: string | null
): string | null {
  if (persistedFile !== null && treeContainsPath(project.tree, persistedFile)) {
    return persistedFile
  }
  return selectedRoot
}

export function treeContainsPath(
  tree: ProjectEntry,
  targetPath: string
): boolean {
  const segments = targetPath.split("/").filter(Boolean)
  let current = tree
  for (const segment of segments) {
    const child = current.children.find((entry) => entry.name === segment)
    if (child === undefined) {
      return false
    }
    current = child
  }
  return current.kind === "file"
}

export function rootEvidenceLabel(evidence: RootEvidence[]): string {
  const labels = evidence.map((item) =>
    item === "documentClass" ? "document class" : "magic root comment"
  )
  return new Intl.ListFormat(undefined, {
    style: "long",
    type: "conjunction",
  }).format(labels)
}

export function rootCandidateLabel(candidate: RootCandidate): string {
  return `${candidate.path} — ${rootEvidenceLabel(candidate.evidence)}`
}

export function formatLastOpened(timestamp: number, now = Date.now()): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (elapsedMinutes < 1) return "Opened just now"
  if (elapsedMinutes < 60) return `Opened ${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `Opened ${elapsedHours}h ago`

  return `Opened ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(timestamp))}`
}
