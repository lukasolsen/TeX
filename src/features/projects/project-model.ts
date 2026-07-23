import type {
  ProjectEntry,
  ProjectSummary,
  RootCandidate,
  RootEvidence,
} from "@/domain/project"
import { latexCommands, latexFileReferences } from "@/domain/latex"
import type { HiddenEntryPredicate } from "@/domain/file-visibility"
import { isLatexSource, isPdfFile } from "@/domain/file-kind"
import {
  projectRelativePath,
  type ProjectRelativePath,
} from "@/domain/identifiers"

export type ProjectTreeNode = ProjectEntry &
  Readonly<{ path: ProjectRelativePath }>

export type TexDependencyKind = "source" | "bibliography" | "asset" | "package"

export type TexDependency = Readonly<{
  command: string
  kind: TexDependencyKind
  path: ProjectRelativePath
}>

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

/** Counts the entries the configured rules would remove from the tree. */
export function countHiddenEntries(
  entry: ProjectEntry,
  isHidden: HiddenEntryPredicate
): number {
  let total = 0
  for (const child of entry.children) {
    // A hidden folder counts once; its contents are already unreachable.
    if (isHidden(child.name)) total += 1
    else total += countHiddenEntries(child, isHidden)
  }
  return total
}

/**
 * Where a build writes its PDF: beside the root file, or under the project's
 * configured output directory. The viewer and `reveal_project_output` must
 * agree on this — a viewer that only looks beside the root cannot show a PDF
 * the build wrote somewhere else, and the two controls then disagree about
 * which file "the PDF" is.
 */
export function builtPdfPath(
  selectedRoot: ProjectRelativePath,
  outputDirectory: string | null
): ProjectRelativePath {
  const name = selectedRoot.replace(/^.*\//, "").replace(/\.[^/.]+$/, ".pdf")
  const directory = outputDirectory?.replaceAll(/^\.?\/+|\/+$/g, "") ?? ""
  return projectRelativePath(
    directory === ""
      ? selectedRoot.replace(/\.[^/.]+$/, ".pdf")
      : `${directory}/${name}`
  )
}

/**
 * The PDF to adopt once the project's build configuration has loaded, or null
 * to keep the current selection. The workspace is created before the
 * configuration is read, so a project that writes into an output directory
 * starts with no PDF selected; this reconciles that once the answer is known,
 * without disturbing a PDF the user opened themselves.
 */
export function reconciledPdf(
  project: ProjectSummary,
  selectedPdf: ProjectRelativePath | null,
  selectedRoot: ProjectRelativePath | null,
  outputDirectory: string | null
): ProjectRelativePath | null {
  if (selectedPdf !== null || selectedRoot === null) return null
  const output = builtPdfPath(selectedRoot, outputDirectory)
  return treeContainsPath(project.tree, output) ? output : null
}

export function preferredPdf(
  project: ProjectSummary,
  persistedPdf: ProjectRelativePath | null,
  selectedRoot: ProjectRelativePath | null,
  outputDirectory: string | null = null
): ProjectRelativePath | null {
  if (
    persistedPdf !== null &&
    isPdfFile(persistedPdf) &&
    treeContainsPath(project.tree, persistedPdf)
  ) {
    return persistedPdf
  }
  if (selectedRoot === null) return null
  const output = builtPdfPath(selectedRoot, outputDirectory)
  return treeContainsPath(project.tree, output) ? output : null
}

/**
 * Every `.tex` file in the project, in tree order. The build settings offer
 * these rather than a free-text field: TeX already knows which files exist, and
 * a typed path that does not can only fail at save time.
 */
export function latexSourcePaths(entry: ProjectEntry): ProjectRelativePath[] {
  const paths: ProjectRelativePath[] = []
  const walk = (node: ProjectEntry, parent: ProjectRelativePath | null) => {
    for (const child of node.children) {
      const path = projectRelativePath(
        parent === null ? child.name : `${parent}/${child.name}`
      )
      if (child.kind === "directory") walk(child, path)
      else if (isLatexSource(path)) paths.push(path)
    }
  }
  walk(entry, null)
  return paths
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

export function rootEvidenceLabel(
  evidence: ReadonlyArray<RootEvidence>
): string {
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

/** Collects the paths of every file (not directory) in a project tree. */
export function projectFilePaths(
  entry: ProjectEntry,
  parentPath: ProjectRelativePath | null = null,
  paths = new Set<ProjectRelativePath>()
): Set<ProjectRelativePath> {
  for (const child of entry.children) {
    const path = projectRelativePath(
      parentPath === null ? child.name : `${parentPath}/${child.name}`
    )
    if (child.kind === "file") paths.add(path)
    projectFilePaths(child, path, paths)
  }
  return paths
}
