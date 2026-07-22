import { invoke } from "@tauri-apps/api/core"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import type {
  LatexCompletionRequest,
  LatexCompletionResponse,
} from "@/domain/latex-completion"
import { parseLatexCompletionResponse } from "@/domain/latex-completion"
import { imageMediaType } from "@/domain/file-kind"

import type { AppPreferences } from "@/domain/preferences"
import type {
  ProjectError,
  ProjectImage,
  ProjectSearchResponse,
  ProjectSummary,
  RecoveryDraft,
  ReplaceResponse,
  SourceDocument,
  SourceRevision,
  StartupState,
  WorkspaceState,
} from "@/domain/project"
import {
  parseAppPreferences,
  parseBinaryResponse,
  parseForwardSearchResult,
  parseInverseSearchResult,
  parseOptionalProjectPath,
  parsePdfRevision,
  parseProjectSearchResponse,
  parseProjectSummary,
  parseRecoveryDraft,
  parseReplaceResponse,
  parseSourceDocument,
  parseStartupState,
} from "@/services/project-contract"

const unexpectedProjectError: ProjectError = {
  code: "unavailable",
  message:
    "TeX could not complete that project action. Your project files were not changed.",
}

/** Opens an independent project-home window without changing the current workspace. */
export async function createNewWindow(): Promise<void> {
  return invoke("create_new_window")
}

export async function chooseProjectFolder(): Promise<CanonicalProjectPath | null> {
  return parseOptionalProjectPath(
    await invoke<unknown>("choose_project_folder")
  )
}

export async function openProjectFolder(
  path: CanonicalProjectPath
): Promise<ProjectSummary> {
  return parseProjectSummary(await invoke<unknown>("open_project", { path }))
}

export async function loadStartupState(): Promise<StartupState> {
  return parseStartupState(await invoke<unknown>("load_startup_state"))
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  return parseAppPreferences(await invoke<unknown>("load_app_preferences"))
}

export async function saveAppPreferences(
  preferences: AppPreferences
): Promise<void> {
  return invoke("save_app_preferences", { preferences })
}

export async function forgetRecentProject(
  path: CanonicalProjectPath
): Promise<StartupState> {
  return parseStartupState(
    await invoke<unknown>("forget_recent_project", { projectPath: path })
  )
}

export async function saveWorkspaceState(
  workspace: WorkspaceState
): Promise<void> {
  return invoke("save_workspace_state", { workspace })
}

export async function readProjectSource(
  projectPath: CanonicalProjectPath,
  relativePath: ProjectRelativePath
): Promise<SourceDocument> {
  return parseSourceDocument(
    await invoke<unknown>("read_project_source", {
      projectPath,
      relativePath,
    })
  )
}

export async function requestLatexCompletions(
  request: LatexCompletionRequest
): Promise<LatexCompletionResponse> {
  return parseLatexCompletionResponse(
    await invoke<unknown>("latex_completions", { request })
  )
}

export async function readProjectPdf(
  projectPath: CanonicalProjectPath,
  relativePath: ProjectRelativePath
): Promise<Uint8Array> {
  const response = await invoke<unknown>("read_project_pdf", {
    projectPath,
    relativePath,
  })
  return parseBinaryResponse(response)
}

/** Reads a project-local image; the media type follows from its extension. */
export async function readProjectImage(
  projectPath: CanonicalProjectPath,
  relativePath: ProjectRelativePath
): Promise<ProjectImage> {
  const mediaType = imageMediaType(relativePath)
  if (mediaType === null) {
    throw Object.assign(new Error("TeX cannot display this image format."), {
      code: "unsupported-image",
    })
  }
  const response = await invoke<unknown>("read_project_image", {
    projectPath,
    relativePath,
  })
  return {
    path: relativePath,
    mediaType,
    bytes: parseBinaryResponse(response),
  }
}

export async function projectPdfRevision(
  projectPath: CanonicalProjectPath,
  relativePath: ProjectRelativePath
): Promise<string> {
  return parsePdfRevision(
    await invoke<unknown>("project_pdf_revision", { projectPath, relativePath })
  )
}

export type ForwardSearchResult = { page: number; x: number; y: number }
export type InverseSearchResult = {
  path: ProjectRelativePath
  line: number
  column: number
}

export async function synctexForwardSearch(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    pdfPath: ProjectRelativePath
    sourcePath: ProjectRelativePath
    line: number
    column: number
  }>
): Promise<ForwardSearchResult> {
  const { projectPath, pdfPath, sourcePath, line, column } = request
  return parseForwardSearchResult(
    await invoke<unknown>("synctex_forward_search", {
      projectPath,
      pdfPath,
      sourcePath,
      line,
      column,
    })
  )
}

export async function synctexInverseSearch(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    pdfPath: ProjectRelativePath
    page: number
    x: number
    y: number
  }>
): Promise<InverseSearchResult> {
  const { projectPath, pdfPath, page, x, y } = request
  return parseInverseSearchResult(
    await invoke<unknown>("synctex_inverse_search", {
      projectPath,
      pdfPath,
      page,
      x,
      y,
    })
  )
}

export async function saveProjectSource(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    relativePath: ProjectRelativePath
    content: string
    expectedRevision: SourceRevision
  }>
): Promise<SourceDocument> {
  const { projectPath, relativePath, content, expectedRevision } = request
  return parseSourceDocument(
    await invoke<unknown>("save_project_source", {
      projectPath,
      relativePath,
      content,
      expectedRevision,
    })
  )
}

export async function saveRecoveryDraft(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    relativePath: ProjectRelativePath
    content: string
    baseRevision: SourceRevision
  }>
): Promise<void> {
  const { projectPath, relativePath, content, baseRevision } = request
  return invoke("save_recovery_draft", {
    projectPath,
    relativePath,
    content,
    baseRevision,
  })
}

export async function loadRecoveryDraft(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    relativePath: ProjectRelativePath
  }>
): Promise<RecoveryDraft | null> {
  const { projectPath, relativePath } = request
  return parseRecoveryDraft(
    await invoke<unknown>("load_recovery_draft", {
      projectPath,
      relativePath,
    })
  )
}

export async function discardRecoveryDraft(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    relativePath: ProjectRelativePath
  }>
): Promise<void> {
  const { projectPath, relativePath } = request
  return invoke("discard_recovery_draft", { projectPath, relativePath })
}

export async function searchProjectSources(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    query: string
    caseSensitive: boolean
  }>
): Promise<ProjectSearchResponse> {
  const { projectPath, query, caseSensitive } = request
  return parseProjectSearchResponse(
    await invoke<unknown>("search_project_sources", {
      projectPath,
      query,
      caseSensitive,
    })
  )
}

export async function replaceProjectSources(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    query: string
    replacement: string
    caseSensitive: boolean
    expectedFiles: ReadonlyArray<{
      path: ProjectRelativePath
      revision: SourceRevision
    }>
  }>
): Promise<ReplaceResponse> {
  const { projectPath, query, replacement, caseSensitive, expectedFiles } =
    request
  return parseReplaceResponse(
    await invoke<unknown>("replace_project_sources", {
      projectPath,
      query,
      replacement,
      caseSensitive,
      expectedFiles,
    })
  )
}

export async function undoProjectReplace(
  transactionId: string
): Promise<ReplaceResponse> {
  return parseReplaceResponse(
    await invoke<unknown>("undo_project_replace", { transactionId })
  )
}

export async function createProjectEntry(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    parentPath: ProjectRelativePath | null
    name: string
    directory: boolean
  }>
): Promise<void> {
  const { projectPath, parentPath, name, directory } = request
  return invoke("create_project_entry", {
    projectPath,
    parentPath,
    name,
    directory,
  })
}

export async function renameProjectEntry(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    relativePath: ProjectRelativePath
    name: string
  }>
): Promise<void> {
  const { projectPath, relativePath, name } = request
  return invoke("rename_project_entry", { projectPath, relativePath, name })
}

export async function deleteProjectEntry(
  request: Readonly<{
    projectPath: CanonicalProjectPath
    relativePath: ProjectRelativePath
  }>
): Promise<void> {
  const { projectPath, relativePath } = request
  return invoke("delete_project_entry", { projectPath, relativePath })
}

export function projectErrorFromUnknown(error: unknown): ProjectError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    /^[a-z\d-]{1,64}$/.test(error.code) &&
    error.message.length <= 8_192 &&
    !hasControlCharacters(error.message)
  ) {
    return { code: error.code, message: error.message }
  }
  return unexpectedProjectError
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) return true
  }
  return false
}
