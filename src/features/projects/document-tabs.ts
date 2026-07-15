import type { WorkspaceState } from "@/domain/project"

/** Selects a source file, optionally retaining it as a pinned document tab. */
export function openDocument(
  workspace: WorkspaceState,
  path: string,
  pin: boolean
): WorkspaceState {
  const pinnedFiles =
    pin && !workspace.pinnedFiles.includes(path)
      ? [...workspace.pinnedFiles, path]
      : workspace.pinnedFiles

  return { ...workspace, pinnedFiles, selectedFile: path }
}

/** Removes a tab and selects the most recently pinned document when needed. */
export function closeDocument(
  workspace: WorkspaceState,
  path: string
): WorkspaceState {
  const pinnedFiles = workspace.pinnedFiles.filter((file) => file !== path)
  if (workspace.selectedFile !== path) return { ...workspace, pinnedFiles }

  return {
    ...workspace,
    pinnedFiles,
    selectedFile: pinnedFiles.at(-1) ?? null,
  }
}
