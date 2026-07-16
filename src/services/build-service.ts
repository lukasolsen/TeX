import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import type {
  BuildEvent,
  BuildInvocation,
  BuildProfile,
  BuildRequest,
  BuildRun,
} from "@/domain/build"

const BUILD_EVENT = "tex://build-event"

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
