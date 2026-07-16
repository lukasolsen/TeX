import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import type {
  BuildEvent,
  BuildInvocation,
  BuildProfile,
  BuildRequest,
  BuildRun,
  WatchEvent,
  WatchStatus,
  ProjectBuildConfiguration,
  CleanPreview,
} from "@/domain/build"

const BUILD_EVENT = "tex://build-event"
const WATCH_EVENT = "tex://watch-event"
const PROJECT_FILES_EVENT = "tex://project-files-event"

export async function previewBuild(
  request: BuildRequest
): Promise<BuildInvocation> {
  return invoke<BuildInvocation>("preview_build", { request })
}

export async function getBuildProfiles(): Promise<BuildProfile[]> {
  return invoke<BuildProfile[]>("get_build_profiles")
}

export async function startBuild(request: BuildRequest): Promise<BuildRun> {
  return invoke<BuildRun>("start_build", { request })
}

export async function stopBuild(projectPath: string): Promise<void> {
  return invoke("stop_build", { projectPath })
}

export async function getBuildHistory(
  projectPath: string
): Promise<BuildRun[]> {
  return invoke<BuildRun[]>("get_build_history", { projectPath })
}

export async function listenForBuildEvents(
  handler: (event: BuildEvent) => void
): Promise<UnlistenFn> {
  return listen<BuildEvent>(BUILD_EVENT, (event) => handler(event.payload))
}

export async function startProjectWatch(projectPath: string): Promise<void> {
  return invoke("start_project_watch", { projectPath })
}

export async function stopProjectWatch(projectPath: string): Promise<void> {
  return invoke("stop_project_watch", { projectPath })
}

export async function getProjectWatchStatus(
  projectPath: string
): Promise<WatchStatus> {
  return invoke<WatchStatus>("get_project_watch_status", { projectPath })
}

export async function listenForWatchEvents(
  handler: (event: WatchEvent) => void
): Promise<UnlistenFn> {
  return listen<WatchEvent>(WATCH_EVENT, (event) => handler(event.payload))
}

export async function startProjectTreeWatch(projectPath: string): Promise<void> {
  return invoke("start_project_tree_watch", { projectPath })
}

export async function stopProjectTreeWatch(projectPath: string): Promise<void> {
  return invoke("stop_project_tree_watch", { projectPath })
}

export async function listenForProjectFileEvents(
  handler: (projectPath: string) => void
): Promise<UnlistenFn> {
  return listen<{ projectPath: string }>(PROJECT_FILES_EVENT, (event) =>
    handler(event.payload.projectPath)
  )
}

export async function loadProjectBuildConfiguration(
  projectPath: string
): Promise<ProjectBuildConfiguration> {
  return invoke<ProjectBuildConfiguration>("load_project_build_configuration", {
    projectPath,
  })
}

export async function saveProjectBuildConfiguration(
  projectPath: string,
  configuration: ProjectBuildConfiguration
): Promise<ProjectBuildConfiguration> {
  return invoke<ProjectBuildConfiguration>("save_project_build_configuration", {
    projectPath,
    configuration,
  })
}

export async function previewCleanAuxiliaryFiles(
  projectPath: string
): Promise<CleanPreview> {
  return invoke<CleanPreview>("preview_clean_auxiliary_files", { projectPath })
}

export async function cleanAuxiliaryFiles(
  projectPath: string,
  files: string[]
): Promise<number> {
  return invoke<number>("clean_auxiliary_files", { projectPath, files })
}

export async function acknowledgeProjectWatchBuild(
  projectPath: string
): Promise<void> {
  return invoke("acknowledge_project_watch_build", { projectPath })
}

export async function revealProjectOutput(
  projectPath: string,
  rootFile: string
): Promise<void> {
  return invoke("reveal_project_output", { projectPath, rootFile })
}
