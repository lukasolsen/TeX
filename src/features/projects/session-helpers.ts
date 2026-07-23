import type {
  AppSessionState,
  AsyncDocumentState,
  OpenProjectFeedback,
  ProjectSession,
  ProjectSummary,
  StartupState,
  WorkspaceState,
} from "@/domain/project"
import {
  projectRelativePath,
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import { isImageFile } from "@/domain/file-kind"
import {
  preferredRoot,
  preferredPdf,
  preferredSourceFile,
} from "@/features/projects/project-model"
import { restoreWorkspaceGeometry } from "@/features/projects/workspace-restoration"
import {
  loadRecoveryDraft,
  projectErrorFromUnknown,
  readProjectImage,
  readProjectSource,
} from "@/services/project-service"

export function readyDocument(
  document: Awaited<ReturnType<typeof readProjectSource>>
): AsyncDocumentState {
  return {
    status: "ready",
    document,
    content: document.content,
    saveState: { status: "saved" },
  }
}

/**
 * Opens whatever the project tree pointed at. Images are read as bytes and
 * shown in their own viewer; everything else the backend will read as text
 * becomes an editable document with its recovery draft applied.
 */
export async function loadDocument(
  projectPath: CanonicalProjectPath,
  relativePath: ProjectRelativePath
): Promise<AsyncDocumentState> {
  if (isImageFile(relativePath)) {
    return {
      status: "image",
      path: relativePath,
      image: await readProjectImage(projectPath, relativePath),
    }
  }
  const document = await readProjectSource(projectPath, relativePath)
  const draft = await loadRecoveryDraft({ projectPath, relativePath })
  if (draft === null || draft.content === document.content) {
    return readyDocument(document)
  }
  return {
    status: "ready",
    document,
    content: draft.content,
    saveState: { status: "recovery", draft },
  }
}

export const emptyStartupState: StartupState = {
  recentProjects: [],
  lastWorkspace: null,
  restorationNotice: null,
}

export const dialogError = {
  code: "dialog-unavailable",
  message:
    "TeX could not show the folder picker. Try again after restarting the application.",
}

export const recoveryFailureNotice =
  "TeX could not update the recovery copy. Keep TeX open until the source is saved."
export const workspacePersistenceFailureNotice =
  "TeX could not persist the current workspace layout. Keep TeX open to retain this context."

export function workspaceForProject(
  project: ProjectSummary,
  restored: WorkspaceState | null
): WorkspaceState {
  const selectedRoot = preferredRoot(project, restored?.selectedRoot ?? null)
  return {
    projectPath: project.path,
    pinnedFiles: restored?.pinnedFiles ?? [],
    selectedRoot,
    selectedFile: preferredSourceFile(
      project,
      restored?.selectedFile ?? null,
      selectedRoot
    ),
    sidebarWidth: restored?.sidebarWidth ?? 288,
    editorFontSize: restored?.editorFontSize ?? 14,
    pdfPaneOpen: restored?.pdfPaneOpen ?? true,
    pdfPaneWidth: restored?.pdfPaneWidth ?? 480,
    buildPanelOpen: restored?.buildPanelOpen ?? false,
    buildPanelHeight: restored?.buildPanelHeight ?? 240,
    sidebarTab: restored?.sidebarTab ?? "files",
    bottomPanelTab: restored?.bottomPanelTab ?? "build",
    buildProfile: restored?.buildProfile ?? "latexmkPdf",
    selectedPdf: preferredPdf(
      project,
      restored?.selectedPdf ?? null,
      selectedRoot
    ),
    pdfViewerStates: restored?.pdfViewerStates ?? {},
    editorViewerStates: restored?.editorViewerStates ?? {},
  }
}

export function combinedNotice(...notices: (string | null)[]): string | null {
  const available = notices.filter(
    (notice): notice is string => notice !== null
  )
  return available.length === 0 ? null : available.join(" ")
}

export function renamedProjectPath(
  path: ProjectRelativePath,
  from: ProjectRelativePath,
  to: ProjectRelativePath
): ProjectRelativePath {
  return path === from || path.startsWith(`${from}/`)
    ? projectRelativePath(`${to}${path.slice(from.length)}`)
    : path
}

export function isProjectPathWithin(
  path: ProjectRelativePath | null,
  parent: ProjectRelativePath
): boolean {
  return path === parent || path?.startsWith(`${parent}/`) === true
}

/**
 * Rewrites every stored path in the workspace when `from` (a file or folder) is
 * renamed to `to`, so pins, the active selection, and per-file viewer state all
 * follow the entry to its new location. Pure over {@link WorkspaceState}.
 */
export function remapWorkspaceAfterRename(
  workspace: WorkspaceState,
  from: ProjectRelativePath,
  to: ProjectRelativePath
): WorkspaceState {
  return {
    ...workspace,
    pinnedFiles: workspace.pinnedFiles.map((file) =>
      renamedProjectPath(file, from, to)
    ),
    selectedRoot:
      workspace.selectedRoot === null
        ? null
        : renamedProjectPath(workspace.selectedRoot, from, to),
    selectedFile:
      workspace.selectedFile === null
        ? null
        : renamedProjectPath(workspace.selectedFile, from, to),
    selectedPdf:
      workspace.selectedPdf === null
        ? null
        : renamedProjectPath(workspace.selectedPdf, from, to),
    pdfViewerStates: Object.fromEntries(
      Object.entries(workspace.pdfViewerStates).map(
        ([pdfPath, viewerState]) => [
          renamedProjectPath(projectRelativePath(pdfPath), from, to),
          viewerState,
        ]
      )
    ),
    editorViewerStates: Object.fromEntries(
      Object.entries(workspace.editorViewerStates).map(
        ([sourcePath, viewerState]) => [
          renamedProjectPath(projectRelativePath(sourcePath), from, to),
          viewerState,
        ]
      )
    ),
  }
}

/**
 * Drops every stored path under the deleted entry `path` from the workspace and
 * picks the next active file (the last pin, else the selected root) when the
 * active file was removed. Pure over {@link WorkspaceState}.
 */
export function pruneWorkspaceAfterDelete(
  workspace: WorkspaceState,
  path: ProjectRelativePath
): WorkspaceState {
  const pinnedFiles = workspace.pinnedFiles.filter(
    (file) => !isProjectPathWithin(file, path)
  )
  const selectedRoot = isProjectPathWithin(workspace.selectedRoot, path)
    ? null
    : workspace.selectedRoot
  const nextFile = isProjectPathWithin(workspace.selectedFile, path)
    ? (pinnedFiles.at(-1) ?? selectedRoot)
    : workspace.selectedFile
  return {
    ...workspace,
    pinnedFiles,
    selectedRoot,
    editorViewerStates: Object.fromEntries(
      Object.entries(workspace.editorViewerStates).filter(
        ([sourcePath]) =>
          !isProjectPathWithin(projectRelativePath(sourcePath), path)
      )
    ),
    selectedFile: nextFile,
    selectedPdf: isProjectPathWithin(workspace.selectedPdf, path)
      ? null
      : workspace.selectedPdf,
    pdfViewerStates: Object.fromEntries(
      Object.entries(workspace.pdfViewerStates).filter(
        ([pdfPath]) => !isProjectPathWithin(projectRelativePath(pdfPath), path)
      )
    ),
  }
}

export async function hydrateSession(
  project: ProjectSummary,
  restored: WorkspaceState | null,
  notice: string | null
): Promise<ProjectSession> {
  const restoredGeometry = restoreWorkspaceGeometry(
    workspaceForProject(project, restored),
    { width: window.innerWidth, height: window.innerHeight }
  )
  const workspace = restoredGeometry.workspace
  const restorationNotice = combinedNotice(
    project.persistenceNote,
    notice,
    restoredGeometry.notice
  )
  const selectedFile = workspace.selectedFile
  if (selectedFile === null) {
    return {
      project,
      workspace,
      documentState: { status: "empty" },
      notice: restorationNotice,
    }
  }

  try {
    const documentState = await loadDocument(project.path, selectedFile)
    return {
      project,
      workspace,
      documentState,
      notice: restorationNotice,
    }
  } catch (error: unknown) {
    return {
      project,
      workspace: { ...workspace, selectedFile: null },
      documentState: {
        status: "error",
        path: selectedFile,
        error: projectErrorFromUnknown(error),
      },
      notice: restorationNotice,
    }
  }
}

export function withOpenFeedback(
  current: AppSessionState,
  openFeedback: OpenProjectFeedback
): AppSessionState {
  if (current.status === "starting") return current
  return { ...current, openFeedback }
}
