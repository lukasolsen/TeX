import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import type {
  InstallEvent,
  InstallMethod,
  InstallProgress,
  InstallSupport,
} from "@/domain/latex-install"
import {
  parseInstallEvent,
  parseInstallProgress,
  parseInstallSupport,
  parseOptionalInstallProgress,
} from "@/services/latex-install-contract"
import { acceptEvent } from "@/services/ipc-contract"

const INSTALL_EVENT = "tex://latex-install-event"

export async function getLatexInstallationSupport(): Promise<InstallSupport> {
  return parseInstallSupport(
    await invoke<unknown>("get_latex_installation_support")
  )
}

export async function getLatexInstallationProgress(): Promise<InstallProgress | null> {
  return parseOptionalInstallProgress(
    await invoke<unknown>("get_latex_installation_progress")
  )
}

export async function startLatexInstallation(
  method: InstallMethod
): Promise<InstallProgress> {
  return parseInstallProgress(
    await invoke<unknown>("start_latex_installation", { method })
  )
}

export async function stopLatexInstallation(): Promise<void> {
  return invoke("stop_latex_installation")
}

export async function listenForInstallEvents(
  handler: (event: InstallEvent) => void
): Promise<UnlistenFn> {
  return listen<unknown>(INSTALL_EVENT, (event) =>
    acceptEvent(event.payload, parseInstallEvent, handler)
  )
}
