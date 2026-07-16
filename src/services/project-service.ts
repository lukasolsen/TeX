import { invoke } from "@tauri-apps/api/core"

import type {
  ProjectError,
  AppPreferences,
  ProjectSearchResponse,
  ProjectSummary,
  RecoveryDraft,
  ReplaceResponse,
  SourceDocument,
  SourceRevision,
  StartupState,
  WorkspaceState,
} from "@/domain/project"

const unexpectedProjectError: ProjectError = {
  code: "unavailable",
  message:
    "TeX could not complete that project action. Your project files were not changed.",
}

export async function chooseProjectFolder(): Promise<string | null> {
  return invoke<string | null>("choose_project_folder")
}

export async function openProjectFolder(path: string): Promise<ProjectSummary> {
  return invoke<ProjectSummary>("open_project", { path })
}

export async function loadStartupState(): Promise<StartupState> {
  return invoke<StartupState>("load_startup_state")
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  return invoke<AppPreferences>("load_app_preferences")
}

export async function saveAppPreferences(
  preferences: AppPreferences
): Promise<void> {
  return invoke("save_app_preferences", { preferences })
}

export async function forgetRecentProject(path: string): Promise<StartupState> {
  return invoke<StartupState>("forget_recent_project", { projectPath: path })
}

export async function saveWorkspaceState(
  workspace: WorkspaceState
): Promise<void> {
  return invoke("save_workspace_state", { workspace })
}

export async function readProjectSource(
  projectPath: string,
  relativePath: string
): Promise<SourceDocument> {
  return invoke<SourceDocument>("read_project_source", {
    projectPath,
    relativePath,
  })
}

export async function readProjectPdf(
  projectPath: string,
  relativePath: string
): Promise<Uint8Array> {
  const response = await invoke<ArrayBuffer>("read_project_pdf", {
    projectPath,
    relativePath,
  })
  return new Uint8Array(response)
}

export async function projectPdfRevision(
  projectPath: string,
  relativePath: string
): Promise<string> {
  return invoke<string>("project_pdf_revision", { projectPath, relativePath })
}

export type ForwardSearchResult = { page: number; x: number; y: number }
export type InverseSearchResult = { path: string; line: number; column: number }

export async function synctexForwardSearch(
  projectPath: string,
  pdfPath: string,
  sourcePath: string,
  line: number,
  column: number
): Promise<ForwardSearchResult> {
  return invoke<ForwardSearchResult>("synctex_forward_search", {
    projectPath,
    pdfPath,
    sourcePath,
    line,
    column,
  })
}

export async function synctexInverseSearch(
  projectPath: string,
  pdfPath: string,
  page: number,
  x: number,
  y: number
): Promise<InverseSearchResult> {
  return invoke<InverseSearchResult>("synctex_inverse_search", {
    projectPath,
    pdfPath,
    page,
    x,
    y,
  })
}

export async function saveProjectSource(
  projectPath: string,
  relativePath: string,
  content: string,
  expectedRevision: SourceRevision,
  overwriteExternal = false
): Promise<SourceDocument> {
  return invoke<SourceDocument>("save_project_source", {
    projectPath,
    relativePath,
    content,
    expectedRevision,
    overwriteExternal,
  })
}

export async function saveRecoveryDraft(
  projectPath: string,
  relativePath: string,
  content: string,
  baseRevision: SourceRevision
): Promise<void> {
  return invoke("save_recovery_draft", {
    projectPath,
    relativePath,
    content,
    baseRevision,
  })
}

export async function loadRecoveryDraft(
  projectPath: string,
  relativePath: string
): Promise<RecoveryDraft | null> {
  return invoke<RecoveryDraft | null>("load_recovery_draft", {
    projectPath,
    relativePath,
  })
}

export async function discardRecoveryDraft(
  projectPath: string,
  relativePath: string
): Promise<void> {
  return invoke("discard_recovery_draft", { projectPath, relativePath })
}

export async function searchProjectSources(
  projectPath: string,
  query: string,
  caseSensitive: boolean
): Promise<ProjectSearchResponse> {
  return invoke<ProjectSearchResponse>("search_project_sources", {
    projectPath,
    query,
    caseSensitive,
  })
}

export async function replaceProjectSources(
  projectPath: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
  expectedFiles: { path: string; revision: SourceRevision }[]
): Promise<ReplaceResponse> {
  return invoke<ReplaceResponse>("replace_project_sources", {
    projectPath,
    query,
    replacement,
    caseSensitive,
    expectedFiles,
  })
}

export async function undoProjectReplace(
  transactionId: string
): Promise<ReplaceResponse> {
  return invoke<ReplaceResponse>("undo_project_replace", { transactionId })
}

export async function createProjectEntry(
  projectPath: string,
  parentPath: string | null,
  name: string,
  directory: boolean
): Promise<void> {
  return invoke("create_project_entry", {
    projectPath,
    parentPath,
    name,
    directory,
  })
}

export async function renameProjectEntry(
  projectPath: string,
  relativePath: string,
  name: string
): Promise<void> {
  return invoke("rename_project_entry", { projectPath, relativePath, name })
}

export async function deleteProjectEntry(
  projectPath: string,
  relativePath: string
): Promise<void> {
  return invoke("delete_project_entry", { projectPath, relativePath })
}

export function projectErrorFromUnknown(error: unknown): ProjectError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  ) {
    return { code: error.code, message: error.message }
  }
  return unexpectedProjectError
}
