import type {
  ProjectEntry,
  ProjectSummary,
  RootCandidate,
  RootEvidence,
} from "@/domain/project"
import { latexCommands, latexFileReferences } from "@/domain/latex"
import {
  projectRelativePath,
  type ProjectRelativePath,
} from "@/domain/identifiers"

const readableSourceExtensions = new Set([
  "tex",
  "bib",
  "sty",
  "cls",
  "txt",
  "md",
])

export type ProjectTreeNode = ProjectEntry & { path: ProjectRelativePath }

export type TexDependencyKind = "source" | "bibliography" | "asset" | "package"

export type TexDependency = {
  command: string
  kind: TexDependencyKind
  path: ProjectRelativePath
}

export function projectTreeNodes(
  entry: ProjectEntry,
  parentPath: ProjectRelativePath | null = null
): ProjectTreeNode[] {
  return entry.children.map((child) => ({
    ...child,
    path: projectRelativePath(
      parentPath === null ? child.name : `${parentPath}/${child.name}`
    ),
  }))
}

export function isReadableSource(path: string): boolean {
  const extension = path.split(".").pop()?.toLocaleLowerCase()
  return extension !== undefined && readableSourceExtensions.has(extension)
}

export function isPdf(path: string): boolean {
  return path.toLocaleLowerCase().endsWith(".pdf")
}

export function preferredPdf(
  project: ProjectSummary,
  persistedPdf: ProjectRelativePath | null,
  selectedRoot: ProjectRelativePath | null
): ProjectRelativePath | null {
  if (
    persistedPdf !== null &&
    isPdf(persistedPdf) &&
    treeContainsPath(project.tree, persistedPdf)
  ) {
    return persistedPdf
  }
  if (selectedRoot === null) return null
  const output = projectRelativePath(selectedRoot.replace(/\.[^/.]+$/, ".pdf"))
  return treeContainsPath(project.tree, output) ? output : null
}

/** Extracts direct file references from common LaTeX commands without resolving TeX's full macro language. */
export function texDependencies(
  source: string,
  sourcePath: ProjectRelativePath
): TexDependency[] {
  const dependencies: TexDependency[] = []
  const seen = new Set<string>()
  const candidates: Array<TexDependency & { from: number }> =
    latexFileReferences(source, sourcePath).map((reference) => ({
      from: reference.from,
      command: reference.command,
      kind: dependencyKind(reference.command),
      path: reference.path,
    }))
  for (const parsedCommand of latexCommands(source)) {
    if (
      parsedCommand.name !== "usepackage" &&
      parsedCommand.name !== "documentclass"
    ) {
      continue
    }
    const group = parsedCommand.groups.find(({ kind }) => kind === "required")
    if (group === undefined) continue
    for (const path of group.value.split(",").map((value) => value.trim())) {
      const command = parsedCommand.name
      if (path !== "") {
        candidates.push({
          from: group.from,
          command,
          kind: "package",
          path: projectRelativePath(path),
        })
      }
    }
  }
  candidates.sort((left, right) => left.from - right.from)
  for (const { command, kind, path } of candidates) {
    const key = `${command}:${path}`
    if (!seen.has(key)) {
      seen.add(key)
      dependencies.push({ command, kind, path })
    }
  }
  return dependencies
}

function dependencyKind(command: string): TexDependencyKind {
  if (["input", "include", "subfile"].includes(command)) return "source"
  if (["bibliography", "addbibresource"].includes(command))
    return "bibliography"
  if (command === "includegraphics") return "asset"
  return "package"
}

export function preferredRoot(
  project: ProjectSummary,
  persistedRoot: ProjectRelativePath | null
): ProjectRelativePath | null {
  if (persistedRoot !== null && treeContainsPath(project.tree, persistedRoot)) {
    return persistedRoot
  }
  return project.rootCandidates.length === 1
    ? (project.rootCandidates[0]?.path ?? null)
    : null
}

export function preferredSourceFile(
  project: ProjectSummary,
  persistedFile: ProjectRelativePath | null,
  selectedRoot: ProjectRelativePath | null
): ProjectRelativePath | null {
  if (persistedFile !== null && treeContainsPath(project.tree, persistedFile)) {
    return persistedFile
  }
  return selectedRoot
}

export function treeContainsPath(
  tree: ProjectEntry,
  targetPath: ProjectRelativePath
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

export function rootEvidenceLabel(evidence: ReadonlyArray<RootEvidence>): string {
  const labels = evidence.map((item) =>
    item === "documentClass"
      ? "document class"
      : item === "magicComment"
        ? "magic root comment"
        : "project build configuration"
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
