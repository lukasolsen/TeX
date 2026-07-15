import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"

import type {
  ProjectError,
  ProjectSummary,
  SourceDocument,
  StartupState,
  WorkspaceState,
} from "@/domain/project"

const unexpectedProjectError: ProjectError = {
  code: "unavailable",
  message:
    "TeX could not complete that project action. Your project files were not changed.",
}

export async function chooseProjectFolder(): Promise<string | null> {
  return open({
    directory: true,
    multiple: false,
    title: "Open LaTeX project",
  })
}

export async function openProjectFolder(path: string): Promise<ProjectSummary> {
  return invoke<ProjectSummary>("open_project", { path })
}

export async function loadStartupState(): Promise<StartupState> {
  return invoke<StartupState>("load_startup_state")
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
