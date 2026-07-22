import { useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

import type {
  AppSessionState,
  WorkspaceState,
  WorkspaceViewUpdate,
} from "@/domain/project"
import type { ProjectRelativePath } from "@/domain/identifiers"
import { clampInt } from "@/lib/math"

export type WorkspaceViewController = Readonly<{
  resizeSidebar: (width: number, persist: boolean) => void
  setEditorFontSize: (fontSize: number) => void
  openPdf: (path: ProjectRelativePath) => void
  updatePdfViewerState: (
    path: ProjectRelativePath,
    state: WorkspaceState["pdfViewerStates"][string]
  ) => void
  updateEditorViewerState: (
    path: ProjectRelativePath,
    state: WorkspaceState["editorViewerStates"][string]
  ) => void
  updateWorkspaceView: (update: WorkspaceViewUpdate) => void
}>

/**
 * Workspace-view mutators that share the "patch the workspace, then persist it"
 * shape. Each guards on the `workspace` status and leaves other states
 * untouched. The owning session hook supplies its `setState` and the debounced
 * `persistWorkspace` so this stays a pure projection of that state.
 */
export function useWorkspaceView(
  setState: Dispatch<SetStateAction<AppSessionState>>,
  persistWorkspace: (workspace: WorkspaceState) => void
): WorkspaceViewController {
  const resizeSidebar = useCallback(
    (width: number, persist: boolean) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = {
          ...current.session.workspace,
          sidebarWidth: Math.round(width),
        }
        if (persist) persistWorkspace(workspace)
        return {
          ...current,
          session: { ...current.session, workspace },
        }
      })
    },
    [persistWorkspace, setState]
  )

  const setEditorFontSize = useCallback(
    (fontSize: number) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = {
          ...current.session.workspace,
          editorFontSize: clampInt(fontSize, 11, 24),
        }
        persistWorkspace(workspace)
        return {
          ...current,
          session: { ...current.session, workspace },
        }
      })
    },
    [persistWorkspace, setState]
  )

  const openPdf = useCallback(
    (path: ProjectRelativePath) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = { ...current.session.workspace, selectedPdf: path }
        persistWorkspace(workspace)
        return { ...current, session: { ...current.session, workspace } }
      })
    },
    [persistWorkspace, setState]
  )

  const updatePdfViewerState = useCallback(
    (
      path: ProjectRelativePath,
      viewerState: WorkspaceState["pdfViewerStates"][string]
    ) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = {
          ...current.session.workspace,
          pdfViewerStates: {
            ...current.session.workspace.pdfViewerStates,
            [path]: viewerState,
          },
        }
        persistWorkspace(workspace)
        return { ...current, session: { ...current.session, workspace } }
      })
    },
    [persistWorkspace, setState]
  )

  const updateEditorViewerState = useCallback(
    (
      path: ProjectRelativePath,
      viewerState: WorkspaceState["editorViewerStates"][string]
    ) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = {
          ...current.session.workspace,
          editorViewerStates: {
            ...current.session.workspace.editorViewerStates,
            [path]: viewerState,
          },
        }
        persistWorkspace(workspace)
        return { ...current, session: { ...current.session, workspace } }
      })
    },
    [persistWorkspace, setState]
  )

  const updateWorkspaceView = useCallback(
    (update: WorkspaceViewUpdate) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = { ...current.session.workspace, ...update }
        persistWorkspace(workspace)
        return { ...current, session: { ...current.session, workspace } }
      })
    },
    [persistWorkspace, setState]
  )

  return {
    resizeSidebar,
    setEditorFontSize,
    openPdf,
    updatePdfViewerState,
    updateEditorViewerState,
    updateWorkspaceView,
  }
}
