import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"

import type {
  BuildEvent,
  BuildInvocation,
  BuildProfile,
  BuildRequest,
  BuildRun,
  BuildToolReport,
  PackageCandidate,
  WatchEvent,
  WatchStatus,
  ProjectBuildConfiguration,
  CleanPreview,
} from "@/domain/build"
import {
  parseBuildConfiguration,
  parseBuildEvent,
  parseBuildHistory,
  parseBuildInvocation,
  parseBuildProfiles,
  parseBuildRun,
  parseBuildToolReport,
  parsePackageCandidate,
  parseCleanCount,
  parseCleanPreview,
  parseProjectFilesEvent,
  parseWatchEvent,
  parseWatchStatus,
} from "@/services/build-contract"
import { acceptEvent } from "@/services/ipc-contract"

const BUILD_EVENT = "tex://build-event"
const WATCH_EVENT = "tex://watch-event"
const PROJECT_FILES_EVENT = "tex://project-files-event"

export async function getBuildTools(): Promise<BuildToolReport> {
  return parseBuildToolReport(await invoke<unknown>("get_build_tools"))
}

/**
 * Asks the distribution which package provides a missing file. Reaches the
 * package repository, so it runs only when someone asks about one diagnostic.
 */
export async function resolveMissingPackage(
  file: string
): Promise<PackageCandidate | null> {
  return parsePackageCandidate(
    await invoke<unknown>("resolve_missing_package", { file })
  )
}

/** Installs one package after a native dialog names the exact command. */
export async function installLatexPackage(packageName: string): Promise<void> {
  await invoke<unknown>("install_latex_package", { package: packageName })
}

export async function previewBuild(
  request: BuildRequest
): Promise<BuildInvocation> {
  return parseBuildInvocation(
    await invoke<unknown>("preview_build", { request })
  )
}

export async function getBuildProfiles(): Promise<BuildProfile[]> {
  return parseBuildProfiles(await invoke<unknown>("get_build_profiles"))
}

export async function startBuild(request: BuildRequest): Promise<BuildRun> {
  return parseBuildRun(await invoke<unknown>("start_build", { request }))
}

export async function stopBuild(
  projectPath: CanonicalProjectPath
): Promise<void> {
  return invoke("stop_build", { projectPath })
}

export async function getBuildHistory(
  projectPath: CanonicalProjectPath
): Promise<BuildRun[]> {
  return parseBuildHistory(
    await invoke<unknown>("get_build_history", { projectPath })
  )
}

export async function listenForBuildEvents(
  handler: (event: BuildEvent) => void
): Promise<UnlistenFn> {
  return listen<unknown>(BUILD_EVENT, (event) =>
    acceptEvent(event.payload, parseBuildEvent, handler)
  )
}

export async function startProjectWatch(
  projectPath: CanonicalProjectPath
): Promise<void> {
  return invoke("start_project_watch", { projectPath })
}

export async function stopProjectWatch(
  projectPath: CanonicalProjectPath
): Promise<void> {
  return invoke("stop_project_watch", { projectPath })
}

export async function getProjectWatchStatus(
  projectPath: CanonicalProjectPath
): Promise<WatchStatus> {
  return parseWatchStatus(
    await invoke<unknown>("get_project_watch_status", { projectPath })
  )
}

export async function listenForWatchEvents(
  handler: (event: WatchEvent) => void
): Promise<UnlistenFn> {
  return listen<unknown>(WATCH_EVENT, (event) =>
    acceptEvent(event.payload, parseWatchEvent, handler)
  )
}

export async function startProjectTreeWatch(
  projectPath: CanonicalProjectPath
): Promise<void> {
  return invoke("start_project_tree_watch", { projectPath })
}

export async function stopProjectTreeWatch(
  projectPath: CanonicalProjectPath
): Promise<void> {
  return invoke("stop_project_tree_watch", { projectPath })
}

export async function listenForProjectFileEvents(
  handler: (projectPath: CanonicalProjectPath) => void
): Promise<UnlistenFn> {
  return listen<unknown>(PROJECT_FILES_EVENT, (event) =>
    acceptEvent(event.payload, parseProjectFilesEvent, handler)
  )
}

export async function loadProjectBuildConfiguration(
  projectPath: CanonicalProjectPath
): Promise<ProjectBuildConfiguration> {
  return parseBuildConfiguration(
    await invoke<unknown>("load_project_build_configuration", {
      projectPath,
    })
  )
}

export async function saveProjectBuildConfiguration(
  projectPath: CanonicalProjectPath,
  configuration: ProjectBuildConfiguration
): Promise<ProjectBuildConfiguration> {
  return parseBuildConfiguration(
    await invoke<unknown>("save_project_build_configuration", {
      projectPath,
      configuration,
    })
  )
}

export async function previewCleanAuxiliaryFiles(
  projectPath: CanonicalProjectPath
): Promise<CleanPreview> {
  return parseCleanPreview(
    await invoke<unknown>("preview_clean_auxiliary_files", { projectPath })
  )
}

export async function cleanAuxiliaryFiles(
  projectPath: CanonicalProjectPath,
  files: ReadonlyArray<ProjectRelativePath>
): Promise<number> {
  return parseCleanCount(
    await invoke<unknown>("clean_auxiliary_files", { projectPath, files })
  )
}

export async function acknowledgeProjectWatchBuild(
  projectPath: CanonicalProjectPath
): Promise<void> {
  return invoke("acknowledge_project_watch_build", { projectPath })
}

export async function revealProjectOutput(
  projectPath: CanonicalProjectPath,
  rootFile: ProjectRelativePath
): Promise<void> {
  return invoke("reveal_project_output", { projectPath, rootFile })
}
