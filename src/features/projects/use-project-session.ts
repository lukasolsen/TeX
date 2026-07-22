import { useCallback, useEffect, useRef, useState } from "react"

import type {
  AppSessionState,
  EditorDocumentChange,
  WorkspaceState,
} from "@/domain/project"
import {
  projectRelativePath,
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import {
  closeDocument,
  openDocument,
  shouldSaveBeforeOpening,
} from "@/features/projects/document-tabs"
import {
  dialogError,
  emptyStartupState,
  hydrateSession,
  loadDocument,
  pruneWorkspaceAfterDelete,
  readyDocument,
  recoveryFailureNotice,
  remapWorkspaceAfterRename,
  renamedProjectPath,
  withOpenFeedback,
  workspacePersistenceFailureNotice,
} from "@/features/projects/session-helpers"
import { useWorkspaceView } from "@/features/projects/use-workspace-view"
import {
  classifyEditorChange,
  saveStateAfterWrite,
} from "@/features/editor/editor-change"
import { runDetached } from "@/lib/promises"
import {
  chooseProjectFolder,
  createProjectEntry as createProjectEntryRequest,
  deleteProjectEntry as deleteProjectEntryRequest,
  forgetRecentProject,
  discardRecoveryDraft,
  loadStartupState,
  openProjectFolder,
  projectErrorFromUnknown,
  readProjectSource,
  saveProjectSource,
  saveRecoveryDraft,
  renameProjectEntry as renameProjectEntryRequest,
  saveWorkspaceState,
} from "@/services/project-service"

export type ProjectSessionController = Readonly<{
  state: AppSessionState
  chooseAndOpenProject: () => Promise<void>
  clearFeedback: () => void
  closeFile: (path: ProjectRelativePath) => Promise<void>
  closeFiles: (paths: ReadonlyArray<ProjectRelativePath>) => Promise<void>
  createProjectEntry: (
    parentPath: ProjectRelativePath | null,
    name: string,
    directory: boolean
  ) => Promise<boolean>
  deleteProjectEntry: (path: ProjectRelativePath) => Promise<void>
  editDocument: (
    projectPath: CanonicalProjectPath,
    path: ProjectRelativePath,
    change: EditorDocumentChange
  ) => void
  forgetProject: (path: CanonicalProjectPath) => Promise<void>
  openProjectAtPath: (path: CanonicalProjectPath) => Promise<void>
  openPdf: (path: ProjectRelativePath) => void
  pinFile: (path: ProjectRelativePath) => void
  previewFile: (path: ProjectRelativePath) => void
  refreshActiveDocument: () => Promise<void>
  refreshProjectFiles: () => Promise<void>
  renameProjectEntry: (
    path: ProjectRelativePath,
    name: string
  ) => Promise<boolean>
  resizeSidebar: (width: number, persist: boolean) => void
  resolveExternalChange: (keepMine: boolean) => Promise<void>
  resolveRecovery: (restore: boolean) => Promise<void>
  returnHome: () => Promise<void>
  selectRoot: (path: ProjectRelativePath) => void
  setEditorFontSize: (fontSize: number) => void
  saveActiveDocument: () => Promise<boolean>
  updatePdfViewerState: (
    path: ProjectRelativePath,
    state: WorkspaceState["pdfViewerStates"][string]
  ) => void
  updateEditorViewerState: (
    path: ProjectRelativePath,
    state: WorkspaceState["editorViewerStates"][string]
  ) => void
  updateWorkspaceView: (
    update: Partial<
      Pick<
        WorkspaceState,
        | "pdfPaneOpen"
        | "pdfPaneWidth"
        | "buildPanelOpen"
        | "buildPanelHeight"
        | "sidebarTab"
        | "buildPanelTab"
        | "bottomPanelTab"
        | "buildProfile"
      >
    >
  ) => void
}>

/** Owns startup restoration and the project editing session state machine. */
export function useProjectSession({
  restoreStartupWorkspace = true,
}: {
  restoreStartupWorkspace?: boolean
} = {}): ProjectSessionController {
  const [state, setState] = useState<AppSessionState>({ status: "starting" })
  const stateRef = useRef<AppSessionState>(state)
  const documentRequest = useRef(0)
  const projectRequest = useRef(0)
  const projectRefreshRequest = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composingDocument = useRef<ProjectRelativePath | null>(null)
  const conflictResolutionInFlight = useRef(false)
  const saveInFlight = useRef<Promise<boolean> | null>(null)
  const saveActionRef = useRef<() => Promise<boolean>>(async () => true)
  const persistWorkspace = useRef((workspace: WorkspaceState): void => {
    void saveWorkspaceState(workspace).catch(() => {
      setState((current) =>
        current.status !== "workspace" ||
        current.session.project.path !== workspace.projectPath
          ? current
          : {
              ...current,
              session: {
                ...current.session,
                notice: workspacePersistenceFailureNotice,
              },
            }
      )
    })
  }).current

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(
    () => () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      if (recoveryTimer.current !== null) clearTimeout(recoveryTimer.current)
    },
    []
  )

  useEffect(() => {
    let active = true

    async function start(): Promise<void> {
      const request = projectRequest.current
      try {
        const startup = await loadStartupState()
        if (!active || request !== projectRequest.current) return
        if (!restoreStartupWorkspace || startup.lastWorkspace === null) {
          setState({
            status: "home",
            startup,
            openFeedback: { status: "idle" },
          })
          return
        }

        try {
          const project = await openProjectFolder(
            startup.lastWorkspace.projectPath
          )
          const session = await hydrateSession(
            project,
            startup.lastWorkspace,
            startup.restorationNotice
          )
          if (!active || request !== projectRequest.current) return
          setState({
            status: "workspace",
            session,
            openFeedback: { status: "idle" },
          })
          persistWorkspace(session.workspace)
        } catch (error: unknown) {
          if (!active || request !== projectRequest.current) return
          setState({
            status: "home",
            startup: { ...startup, lastWorkspace: null },
            openFeedback: {
              status: "error",
              error: projectErrorFromUnknown(error),
            },
          })
        }
      } catch (error: unknown) {
        if (!active) return
        setState({
          status: "home",
          startup: emptyStartupState,
          openFeedback: {
            status: "error",
            error: projectErrorFromUnknown(error),
          },
        })
      }
    }

    void start()
    return () => {
      active = false
    }
  }, [persistWorkspace, restoreStartupWorkspace])

  const openProjectAtPath = useCallback(
    async (path: CanonicalProjectPath) => {
      projectRequest.current += 1
      const request = projectRequest.current
      documentRequest.current += 1
      setState((current) =>
        withOpenFeedback(current, { status: "opening", path })
      )
      try {
        const project = await openProjectFolder(path)
        const session = await hydrateSession(project, null, null)
        if (request !== projectRequest.current) return
        setState({
          status: "workspace",
          session,
          openFeedback: { status: "idle" },
        })
        persistWorkspace(session.workspace)
      } catch (error: unknown) {
        if (request !== projectRequest.current) return
        setState((current) =>
          withOpenFeedback(current, {
            status: "error",
            error: projectErrorFromUnknown(error),
          })
        )
      }
    },
    [persistWorkspace]
  )

  const chooseAndOpenProject = useCallback(async () => {
    if (!(await saveActionRef.current())) return
    setState((current) => withOpenFeedback(current, { status: "choosing" }))
    let selectedPath: CanonicalProjectPath | null
    try {
      selectedPath = await chooseProjectFolder()
    } catch {
      setState((current) =>
        withOpenFeedback(current, { status: "error", error: dialogError })
      )
      return
    }
    if (selectedPath === null) {
      setState((current) => withOpenFeedback(current, { status: "cancelled" }))
      return
    }
    await openProjectAtPath(selectedPath)
  }, [openProjectAtPath])

  const clearFeedback = useCallback(() => {
    setState((current) => withOpenFeedback(current, { status: "idle" }))
  }, [])

  const forgetProject = useCallback(async (path: CanonicalProjectPath) => {
    try {
      const startup = await forgetRecentProject(path)
      setState({
        status: "home",
        startup,
        openFeedback: { status: "idle" },
      })
    } catch (error: unknown) {
      setState((current) =>
        withOpenFeedback(current, {
          status: "error",
          error: projectErrorFromUnknown(error),
        })
      )
    }
  }, [])

  const performDocumentSave = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current
    if (
      current.status !== "workspace" ||
      current.session.documentState.status !== "ready"
    ) {
      return true
    }
    const active = current.session.documentState
    if (composingDocument.current === active.document.path) return false
    if (conflictResolutionInFlight.current) return false
    if (active.saveState.status === "saved") return true
    if (
      active.saveState.status === "saving" ||
      active.saveState.status === "conflict" ||
      active.saveState.status === "recovery"
    ) {
      return false
    }

    const projectPath = current.session.project.path
    const path = active.document.path
    const content = active.content
    const revision = active.document.revision
    setState((value) =>
      value.status !== "workspace" ||
      value.session.documentState.status !== "ready" ||
      value.session.documentState.document.path !== path
        ? value
        : {
            ...value,
            session: {
              ...value.session,
              documentState: {
                ...value.session.documentState,
                saveState: { status: "saving" },
              },
            },
          }
    )

    try {
      const document = await saveProjectSource({
        projectPath,
        relativePath: path,
        content,
        expectedRevision: revision,
      })
      setState((value) => {
        if (
          value.status !== "workspace" ||
          value.session.documentState.status !== "ready" ||
          value.session.documentState.document.path !== path
        ) {
          return value
        }
        return {
          ...value,
          session: {
            ...value.session,
            notice:
              value.session.notice === recoveryFailureNotice
                ? null
                : value.session.notice,
            documentState: {
              ...value.session.documentState,
              document,
              saveState: saveStateAfterWrite(
                value.session.documentState.content,
                content
              ),
            },
          },
        }
      })
      const latest = stateRef.current
      return (
        latest.status === "workspace" &&
        latest.session.documentState.status === "ready" &&
        latest.session.documentState.document.path === path &&
        latest.session.documentState.content === content
      )
    } catch (error: unknown) {
      const projectError = projectErrorFromUnknown(error)
      if (projectError.code === "external-change") {
        try {
          const external = await readProjectSource(projectPath, path)
          setState((value) =>
            value.status !== "workspace" ||
            value.session.documentState.status !== "ready" ||
            value.session.documentState.document.path !== path
              ? value
              : {
                  ...value,
                  session: {
                    ...value.session,
                    documentState: {
                      ...value.session.documentState,
                      saveState: { status: "conflict", external },
                    },
                  },
                }
          )
        } catch {
          setState((value) =>
            value.status !== "workspace" ||
            value.session.documentState.status !== "ready"
              ? value
              : {
                  ...value,
                  session: {
                    ...value.session,
                    documentState: {
                      ...value.session.documentState,
                      saveState: { status: "error", error: projectError },
                    },
                  },
                }
          )
        }
      } else {
        setState((value) =>
          value.status !== "workspace" ||
          value.session.documentState.status !== "ready" ||
          value.session.documentState.document.path !== path
            ? value
            : {
                ...value,
                session: {
                  ...value.session,
                  documentState: {
                    ...value.session.documentState,
                    saveState: { status: "error", error: projectError },
                  },
                },
              }
        )
      }
      return false
    }
  }, [])

  const saveActiveDocument = useCallback((): Promise<boolean> => {
    if (saveInFlight.current !== null) return saveInFlight.current
    const operation = performDocumentSave().finally(() => {
      if (saveInFlight.current === operation) saveInFlight.current = null
    })
    saveInFlight.current = operation
    return operation
  }, [performDocumentSave])

  useEffect(() => {
    saveActionRef.current = saveActiveDocument
  }, [saveActiveDocument])

  useEffect(() => {
    const saveOnWindowLoss = (): void => {
      void saveActionRef.current().catch(() => {
        // Save failures are represented by the document save state.
      })
    }
    const saveWhenHidden = (): void => {
      if (document.visibilityState === "hidden") saveOnWindowLoss()
    }
    window.addEventListener("blur", saveOnWindowLoss)
    document.addEventListener("visibilitychange", saveWhenHidden)
    return () => {
      window.removeEventListener("blur", saveOnWindowLoss)
      document.removeEventListener("visibilitychange", saveWhenHidden)
    }
  }, [])

  const editDocument = useCallback(
    (
      projectPath: CanonicalProjectPath,
      path: ProjectRelativePath,
      change: EditorDocumentChange
    ) => {
      const current = stateRef.current
      if (
        current.status !== "workspace" ||
        current.session.project.path !== projectPath ||
        current.session.documentState.status !== "ready" ||
        current.session.documentState.document.path !== path
      ) {
        return
      }
      const decision = classifyEditorChange(
        current.session.documentState.content,
        composingDocument.current,
        path,
        change
      )
      composingDocument.current = decision.composingDocument
      if (!decision.accepted) return
      const { project } = current.session
      if (decision.contentChanged) {
        setState((value) =>
          value.status !== "workspace" ||
          value.session.documentState.status !== "ready" ||
          value.session.documentState.document.path !== path
            ? value
            : {
                ...value,
                session: {
                  ...value.session,
                  documentState: {
                    ...value.session.documentState,
                    content: change.content,
                    saveState: { status: "dirty" },
                  },
                },
              }
        )
      }

      if (!decision.schedulePersistence) return

      recoveryTimer.current ??= setTimeout(() => {
        recoveryTimer.current = null
        const latest = stateRef.current
        if (
          latest.status !== "workspace" ||
          latest.session.documentState.status !== "ready" ||
          latest.session.documentState.document.path !== path
        ) {
          return
        }
        void saveRecoveryDraft({
          projectPath: project.path,
          relativePath: path,
          content: latest.session.documentState.content,
          baseRevision: latest.session.documentState.document.revision,
        }).catch(() => {
          setState((value) =>
            value.status !== "workspace"
              ? value
              : {
                  ...value,
                  session: {
                    ...value.session,
                    notice: recoveryFailureNotice,
                  },
                }
          )
        })
      }, 150)
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        runDetached(saveActionRef.current())
      }, 850)
    },
    []
  )

  const resolveRecovery = useCallback(async (restore: boolean) => {
    const current = stateRef.current
    if (
      current.status !== "workspace" ||
      current.session.documentState.status !== "ready" ||
      current.session.documentState.saveState.status !== "recovery"
    ) {
      return
    }
    const { project, documentState } = current.session
    const path = documentState.document.path
    if (!restore) {
      await discardRecoveryDraft({
        projectPath: project.path,
        relativePath: documentState.document.path,
      })
    }
    setState((value) =>
      value.status !== "workspace" ||
      value.session.project.path !== project.path ||
      value.session.documentState.status !== "ready" ||
      value.session.documentState.document.path !== path
        ? value
        : {
            ...value,
            session: {
              ...value.session,
              documentState: {
                ...value.session.documentState,
                content: restore
                  ? value.session.documentState.content
                  : value.session.documentState.document.content,
                saveState: restore ? { status: "dirty" } : { status: "saved" },
              },
            },
          }
    )
    if (restore) {
      saveTimer.current = setTimeout(
        () => runDetached(saveActionRef.current()),
        250
      )
    }
  }, [])

  const resolveExternalChange = useCallback(async (keepMine: boolean) => {
    const current = stateRef.current
    if (
      current.status !== "workspace" ||
      current.session.documentState.status !== "ready"
    ) {
      return
    }
    const { project, documentState } = current.session
    if (documentState.saveState.status !== "conflict") return
    const path = documentState.document.path
    const content = documentState.content
    const external = documentState.saveState.external
    if (!keepMine) {
      await discardRecoveryDraft({
        projectPath: project.path,
        relativePath: path,
      })
      setState((value) =>
        value.status !== "workspace" ||
        value.session.project.path !== project.path ||
        value.session.documentState.status !== "ready" ||
        value.session.documentState.document.path !== path
          ? value
          : {
              ...value,
              session: {
                ...value.session,
                documentState: readyDocument(external),
              },
            }
      )
      return
    }
    if (conflictResolutionInFlight.current) return
    conflictResolutionInFlight.current = true
    let writeSucceeded = false
    setState((value) =>
      value.status !== "workspace" ||
      value.session.project.path !== project.path ||
      value.session.documentState.status !== "ready" ||
      value.session.documentState.document.path !== path
        ? value
        : {
            ...value,
            session: {
              ...value.session,
              documentState: {
                ...value.session.documentState,
                saveState: { status: "saving" },
              },
            },
          }
    )
    try {
      const document = await saveProjectSource({
        projectPath: project.path,
        relativePath: path,
        content,
        expectedRevision: external.revision,
      })
      setState((value) =>
        value.status !== "workspace" ||
        value.session.project.path !== project.path ||
        value.session.documentState.status !== "ready" ||
        value.session.documentState.document.path !== path
          ? value
          : {
              ...value,
              session: {
                ...value.session,
                documentState: {
                  ...value.session.documentState,
                  document,
                  saveState: saveStateAfterWrite(
                    value.session.documentState.content,
                    content
                  ),
                },
              },
            }
      )
      writeSucceeded = true
    } catch (error: unknown) {
      const projectError = projectErrorFromUnknown(error)
      setState((value) =>
        value.status !== "workspace" ||
        value.session.project.path !== project.path ||
        value.session.documentState.status !== "ready" ||
        value.session.documentState.document.path !== path
          ? value
          : {
              ...value,
              session: {
                ...value.session,
                documentState: {
                  ...value.session.documentState,
                  saveState: { status: "error", error: projectError },
                },
              },
            }
      )
    } finally {
      conflictResolutionInFlight.current = false
      const latest = stateRef.current
      if (
        writeSucceeded &&
        latest.status === "workspace" &&
        latest.session.project.path === project.path &&
        latest.session.documentState.status === "ready" &&
        latest.session.documentState.document.path === path
      ) {
        if (saveTimer.current !== null) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(
          () => runDetached(saveActionRef.current()),
          250
        )
      }
    }
  }, [])

  useEffect(() => {
    let checking = false
    async function checkExternalChange() {
      if (checking) return
      const current = stateRef.current
      if (
        current.status !== "workspace" ||
        current.session.documentState.status !== "ready" ||
        current.session.documentState.saveState.status !== "saved"
      ) {
        return
      }
      checking = true
      const active = current.session.documentState
      try {
        const external = await readProjectSource(
          current.session.project.path,
          active.document.path
        )
        if (
          external.revision.contentHash !== active.document.revision.contentHash
        ) {
          setState((value) =>
            value.status !== "workspace" ||
            value.session.project.path !== current.session.project.path ||
            value.session.documentState.status !== "ready" ||
            value.session.documentState.document.path !== external.path ||
            value.session.documentState.saveState.status !== "saved"
              ? value
              : {
                  ...value,
                  session: {
                    ...value.session,
                    documentState: {
                      ...value.session.documentState,
                      saveState: { status: "conflict", external },
                    },
                  },
                }
          )
        }
      } catch {
        // A transient read failure must not replace the editor with an error surface.
      } finally {
        checking = false
      }
    }

    const interval = window.setInterval(() => void checkExternalChange(), 2500)
    const onFocus = () => void checkExternalChange()
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  const openFile = useCallback(
    async (path: ProjectRelativePath, pin: boolean) => {
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      const currentWorkspace = currentState.session.workspace
      if (!shouldSaveBeforeOpening(currentWorkspace, path)) {
        if (!pin || currentWorkspace.pinnedFiles.includes(path)) return
        const workspace = openDocument(currentWorkspace, path, true)
        setState((current) =>
          current.status !== "workspace"
            ? current
            : {
                ...current,
                session: { ...current.session, workspace },
              }
        )
        persistWorkspace(workspace)
        return
      }

      if (!(await saveActiveDocument())) return
      documentRequest.current += 1
      const request = documentRequest.current
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = openDocument(current.session.workspace, path, pin)
        return {
          ...current,
          session: {
            ...current.session,
            workspace,
            documentState: { status: "loading", path },
          },
        }
      })

      const stateAfterSave = stateRef.current
      if (stateAfterSave.status !== "workspace") return
      const projectPath = stateAfterSave.session.project.path

      try {
        const documentState = await loadDocument(projectPath, path)
        if (request !== documentRequest.current) return
        setState((current) => {
          if (current.status !== "workspace") return current
          const workspace = current.session.workspace
          persistWorkspace(workspace)
          return {
            ...current,
            session: {
              ...current.session,
              documentState,
            },
          }
        })
      } catch (error: unknown) {
        if (request !== documentRequest.current) return
        setState((current) => {
          if (current.status !== "workspace") return current
          return {
            ...current,
            session: {
              ...current.session,
              documentState: {
                status: "error",
                path,
                error: projectErrorFromUnknown(error),
              },
            },
          }
        })
      }
    },
    [persistWorkspace, saveActiveDocument]
  )

  const previewFile = useCallback(
    (path: ProjectRelativePath) => {
      runDetached(openFile(path, false))
    },
    [openFile]
  )

  const pinFile = useCallback(
    (path: ProjectRelativePath) => {
      runDetached(openFile(path, true))
    },
    [openFile]
  )

  const closeFile = useCallback(
    async (path: ProjectRelativePath) => {
      if (!(await saveActiveDocument())) return
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      documentRequest.current += 1
      const request = documentRequest.current
      const { project, workspace: previousWorkspace } = currentState.session
      const workspace = closeDocument(previousWorkspace, path)
      const closingActiveFile = previousWorkspace.selectedFile === path
      const nextFile = workspace.selectedFile

      setState((current) => {
        if (current.status !== "workspace") return current
        return {
          ...current,
          session: {
            ...current.session,
            workspace,
            documentState: closingActiveFile
              ? nextFile === null
                ? { status: "empty" }
                : { status: "loading", path: nextFile }
              : current.session.documentState,
          },
        }
      })
      persistWorkspace(workspace)

      if (!closingActiveFile || nextFile === null) return

      try {
        const documentState = await loadDocument(project.path, nextFile)
        if (request !== documentRequest.current) return
        setState((current) => {
          if (current.status !== "workspace") return current
          return {
            ...current,
            session: {
              ...current.session,
              documentState,
            },
          }
        })
      } catch (error: unknown) {
        if (request !== documentRequest.current) return
        setState((current) => {
          if (current.status !== "workspace") return current
          return {
            ...current,
            session: {
              ...current.session,
              documentState: {
                status: "error",
                path: nextFile,
                error: projectErrorFromUnknown(error),
              },
            },
          }
        })
      }
    },
    [persistWorkspace, saveActiveDocument]
  )

  const closeFiles = useCallback(
    async (paths: ReadonlyArray<ProjectRelativePath>) => {
      if (!(await saveActiveDocument())) return
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      documentRequest.current += 1
      const request = documentRequest.current
      const { project, workspace: previousWorkspace } = currentState.session
      const workspace = paths.reduce(
        (accumulator, path) => closeDocument(accumulator, path),
        previousWorkspace
      )
      const activeFileChanged =
        workspace.selectedFile !== previousWorkspace.selectedFile
      const nextFile = workspace.selectedFile

      setState((current) => {
        if (current.status !== "workspace") return current
        return {
          ...current,
          session: {
            ...current.session,
            workspace,
            documentState: activeFileChanged
              ? nextFile === null
                ? { status: "empty" }
                : { status: "loading", path: nextFile }
              : current.session.documentState,
          },
        }
      })
      persistWorkspace(workspace)
      if (!activeFileChanged || nextFile === null) return

      try {
        const documentState = await loadDocument(project.path, nextFile)
        if (request !== documentRequest.current) return
        setState((current) =>
          current.status !== "workspace"
            ? current
            : {
                ...current,
                session: {
                  ...current.session,
                  documentState,
                },
              }
        )
      } catch (error: unknown) {
        if (request !== documentRequest.current) return
        setState((current) =>
          current.status !== "workspace"
            ? current
            : {
                ...current,
                session: {
                  ...current.session,
                  documentState: {
                    status: "error",
                    path: nextFile,
                    error: projectErrorFromUnknown(error),
                  },
                },
              }
        )
      }
    },
    [persistWorkspace, saveActiveDocument]
  )

  const selectRoot = useCallback(
    (path: ProjectRelativePath) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = { ...current.session.workspace, selectedRoot: path }
        persistWorkspace(workspace)
        return {
          ...current,
          session: { ...current.session, workspace },
        }
      })
      runDetached(openFile(path, false))
    },
    [openFile, persistWorkspace]
  )

  const createProjectEntry = useCallback(
    async (
      parentPath: ProjectRelativePath | null,
      name: string,
      directory: boolean
    ): Promise<boolean> => {
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return false
      const projectPath = currentState.session.project.path

      try {
        await createProjectEntryRequest({
          projectPath,
          parentPath,
          name,
          directory,
        })
        const project = await openProjectFolder(projectPath)
        setState((current) =>
          current.status !== "workspace" ||
          current.session.project.path !== projectPath
            ? current
            : {
                ...current,
                session: {
                  ...current.session,
                  project,
                  notice: `Created ${name}.`,
                },
              }
        )
        return true
      } catch (error: unknown) {
        const projectError = projectErrorFromUnknown(error)
        setState((current) =>
          current.status !== "workspace" ||
          current.session.project.path !== projectPath
            ? current
            : {
                ...current,
                session: { ...current.session, notice: projectError.message },
              }
        )
        return false
      }
    },
    []
  )

  const renameProjectEntry = useCallback(
    async (path: ProjectRelativePath, name: string): Promise<boolean> => {
      if (!(await saveActiveDocument())) return false
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return false
      const projectPath = currentState.session.project.path

      const parent = path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : ""
      const renamedPath = projectRelativePath(
        parent === "" ? name : `${parent}/${name}`
      )
      try {
        await renameProjectEntryRequest({
          projectPath,
          relativePath: path,
          name,
        })
        const project = await openProjectFolder(projectPath)
        setState((current) => {
          if (
            current.status !== "workspace" ||
            current.session.project.path !== projectPath
          )
            return current
          const workspace = remapWorkspaceAfterRename(
            current.session.workspace,
            path,
            renamedPath
          )
          const documentState = current.session.documentState
          const nextDocumentState =
            documentState.status === "empty"
              ? documentState
              : documentState.status === "ready"
                ? {
                    ...documentState,
                    document: {
                      ...documentState.document,
                      path: renamedProjectPath(
                        documentState.document.path,
                        path,
                        renamedPath
                      ),
                    },
                  }
                : {
                    ...documentState,
                    path: renamedProjectPath(
                      documentState.path,
                      path,
                      renamedPath
                    ),
                  }
          persistWorkspace(workspace)
          return {
            ...current,
            session: {
              ...current.session,
              project,
              workspace,
              documentState: nextDocumentState,
              notice: `Renamed ${path} to ${renamedPath}.`,
            },
          }
        })
        return true
      } catch (error: unknown) {
        const projectError = projectErrorFromUnknown(error)
        setState((current) =>
          current.status !== "workspace" ||
          current.session.project.path !== projectPath
            ? current
            : {
                ...current,
                session: { ...current.session, notice: projectError.message },
              }
        )
        return false
      }
    },
    [persistWorkspace, saveActiveDocument]
  )

  const deleteProjectEntry = useCallback(
    async (path: ProjectRelativePath) => {
      if (!(await saveActiveDocument())) return
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return
      const projectPath = currentState.session.project.path

      try {
        await deleteProjectEntryRequest({
          projectPath,
          relativePath: path,
        })
        const project = await openProjectFolder(projectPath)
        documentRequest.current += 1
        const request = documentRequest.current
        const previous = currentState.session.workspace
        const workspace = pruneWorkspaceAfterDelete(previous, path)
        const nextFile = workspace.selectedFile
        persistWorkspace(workspace)
        setState((current) => {
          if (
            current.status !== "workspace" ||
            current.session.project.path !== projectPath
          )
            return current
          return {
            ...current,
            session: {
              ...current.session,
              project,
              workspace,
              documentState:
                nextFile === previous.selectedFile
                  ? current.session.documentState
                  : nextFile === null
                    ? { status: "empty" }
                    : { status: "loading", path: nextFile },
              notice: `Deleted ${path}.`,
            },
          }
        })
        if (
          nextFile === null ||
          nextFile === currentState.session.workspace.selectedFile
        ) {
          return
        }
        const documentState = await loadDocument(projectPath, nextFile)
        if (request !== documentRequest.current) return
        setState((current) =>
          current.status !== "workspace" ||
          current.session.project.path !== projectPath
            ? current
            : {
                ...current,
                session: {
                  ...current.session,
                  documentState,
                },
              }
        )
      } catch (error: unknown) {
        const projectError = projectErrorFromUnknown(error)
        setState((current) =>
          current.status !== "workspace" ||
          current.session.project.path !== projectPath
            ? current
            : {
                ...current,
                session: { ...current.session, notice: projectError.message },
              }
        )
      }
    },
    [persistWorkspace, saveActiveDocument]
  )

  const {
    resizeSidebar,
    setEditorFontSize,
    openPdf,
    updatePdfViewerState,
    updateEditorViewerState,
    updateWorkspaceView,
  } = useWorkspaceView(setState, persistWorkspace)

  const refreshActiveDocument = useCallback(async () => {
    const current = stateRef.current
    if (current.status !== "workspace") return
    // An image carries no unsaved work, so a rebuilt figure can simply replace
    // the bytes on screen.
    if (current.session.documentState.status === "image") {
      const imagePath = current.session.documentState.path
      const projectPath = current.session.project.path
      try {
        const documentState = await loadDocument(projectPath, imagePath)
        setState((value) =>
          value.status !== "workspace" ||
          value.session.project.path !== projectPath ||
          value.session.documentState.status !== "image" ||
          value.session.documentState.path !== imagePath
            ? value
            : { ...value, session: { ...value.session, documentState } }
        )
      } catch {
        // The image on screen stays until it can be read again.
      }
      return
    }
    if (
      current.session.documentState.status !== "ready" ||
      current.session.documentState.saveState.status !== "saved"
    ) {
      return
    }
    const path = current.session.documentState.document.path
    try {
      const documentState = await loadDocument(
        current.session.project.path,
        path
      )
      setState((value) =>
        value.status !== "workspace" ||
        value.session.project.path !== current.session.project.path ||
        value.session.documentState.status !== "ready" ||
        value.session.documentState.document.path !== path ||
        value.session.documentState.saveState.status !== "saved"
          ? value
          : {
              ...value,
              session: { ...value.session, documentState },
            }
      )
    } catch {
      // The current editor remains intact when a post-operation refresh is unavailable.
    }
  }, [])

  const refreshProjectFiles = useCallback(async () => {
    const current = stateRef.current
    if (current.status !== "workspace") return
    projectRefreshRequest.current += 1
    const request = projectRefreshRequest.current
    const projectPath = current.session.project.path

    try {
      const project = await openProjectFolder(projectPath)
      if (request !== projectRefreshRequest.current) return
      setState((value) =>
        value.status !== "workspace" ||
        value.session.project.path !== projectPath
          ? value
          : {
              ...value,
              session: { ...value.session, project },
            }
      )
    } catch {
      // A transient external filesystem change must not disturb the current workspace.
    }
    if (request !== projectRefreshRequest.current) return
    await refreshActiveDocument()
  }, [refreshActiveDocument])

  const returnHome = useCallback(async () => {
    if (!(await saveActionRef.current())) return
    projectRequest.current += 1
    documentRequest.current += 1
    try {
      const startup = await loadStartupState()
      setState({
        status: "home",
        startup: { ...startup, lastWorkspace: null },
        openFeedback: { status: "idle" },
      })
    } catch (error: unknown) {
      setState({
        status: "home",
        startup: emptyStartupState,
        openFeedback: {
          status: "error",
          error: projectErrorFromUnknown(error),
        },
      })
    }
  }, [])

  return {
    chooseAndOpenProject,
    clearFeedback,
    closeFile,
    closeFiles,
    createProjectEntry,
    deleteProjectEntry,
    editDocument,
    forgetProject,
    openProjectAtPath,
    openPdf,
    pinFile,
    previewFile,
    refreshActiveDocument,
    refreshProjectFiles,
    renameProjectEntry,
    resizeSidebar,
    resolveExternalChange,
    resolveRecovery,
    returnHome,
    selectRoot,
    setEditorFontSize,
    saveActiveDocument,
    state,
    updatePdfViewerState,
    updateEditorViewerState,
    updateWorkspaceView,
  }
}
