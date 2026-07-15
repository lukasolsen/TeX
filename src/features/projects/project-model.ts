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
