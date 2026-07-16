import { useCallback, useEffect, useRef, useState } from "react"

import type {
  AppSessionState,
  AsyncDocumentState,
  OpenProjectFeedback,
  ProjectSession,
  ProjectSummary,
  StartupState,
  WorkspaceState,
} from "@/domain/project"
import {
  closeDocument,
  openDocument,
  shouldSaveBeforeOpening,
} from "@/features/projects/document-tabs"
import {
  preferredRoot,
  preferredPdf,
  preferredSourceFile,
} from "@/features/projects/project-model"
import { restoreWorkspaceGeometry } from "@/features/projects/workspace-restoration"
import {
  chooseProjectFolder,
  createProjectEntry as createProjectEntryRequest,
  deleteProjectEntry as deleteProjectEntryRequest,
  forgetRecentProject,
  discardRecoveryDraft,
  loadStartupState,
  loadRecoveryDraft,
  openProjectFolder,
  projectErrorFromUnknown,
  readProjectSource,
  saveProjectSource,
  saveRecoveryDraft,
  renameProjectEntry as renameProjectEntryRequest,
  saveWorkspaceState,
} from "@/services/project-service"

function readyDocument(
  document: Awaited<ReturnType<typeof readProjectSource>>
): AsyncDocumentState {
  return {
    status: "ready",
    document,
    content: document.content,
    saveState: { status: "saved" },
  }
}

async function loadEditableDocument(
  projectPath: string,
  relativePath: string
): Promise<AsyncDocumentState> {
  const document = await readProjectSource(projectPath, relativePath)
  const draft = await loadRecoveryDraft(projectPath, relativePath)
  if (draft === null || draft.content === document.content) {
    return readyDocument(document)
  }
  return {
    status: "ready",
    document,
    content: draft.content,
    saveState: { status: "recovery", draft },
  }
}

const emptyStartupState: StartupState = {
  recentProjects: [],
  lastWorkspace: null,
  restorationNotice: null,
}

const dialogError = {
  code: "dialog-unavailable",
  message:
    "TeX could not show the folder picker. Try again after restarting the application.",
}

const recoveryFailureNotice =
  "TeX could not update the recovery copy. Keep TeX open until the source is saved."

function workspaceForProject(
  project: ProjectSummary,
  restored: WorkspaceState | null
): WorkspaceState {
  const selectedRoot = preferredRoot(project, restored?.selectedRoot ?? null)
  return {
    projectPath: project.path,
    pinnedFiles: restored?.pinnedFiles ?? [],
    selectedRoot,
    selectedFile: preferredSourceFile(
      project,
      restored?.selectedFile ?? null,
      selectedRoot
    ),
    sidebarWidth: restored?.sidebarWidth ?? 288,
    editorFontSize: restored?.editorFontSize ?? 14,
    pdfPaneOpen: restored?.pdfPaneOpen ?? true,
    pdfPaneWidth: restored?.pdfPaneWidth ?? 480,
    buildPanelOpen: restored?.buildPanelOpen ?? false,
    buildPanelHeight: restored?.buildPanelHeight ?? 240,
    sidebarTab: restored?.sidebarTab ?? "files",
    buildPanelTab: restored?.buildPanelTab ?? "output",
    buildProfile: restored?.buildProfile ?? "latexmkPdf",
    selectedPdf: preferredPdf(
      project,
      restored?.selectedPdf ?? null,
      selectedRoot
    ),
    pdfViewerStates: restored?.pdfViewerStates ?? {},
    editorViewerStates: restored?.editorViewerStates ?? {},
  }
}

function combinedNotice(...notices: (string | null)[]): string | null {
  const available = notices.filter(
    (notice): notice is string => notice !== null
  )
  return available.length === 0 ? null : available.join(" ")
}

function renamedProjectPath(path: string, from: string, to: string): string {
  return path === from || path.startsWith(`${from}/`)
    ? `${to}${path.slice(from.length)}`
    : path
}

function isProjectPathWithin(path: string | null, parent: string): boolean {
  return path === parent || path?.startsWith(`${parent}/`) === true
}

async function hydrateSession(
  project: ProjectSummary,
  restored: WorkspaceState | null,
  notice: string | null
): Promise<ProjectSession> {
  const restoredGeometry = restoreWorkspaceGeometry(
    workspaceForProject(project, restored),
    { width: window.innerWidth, height: window.innerHeight }
  )
  const workspace = restoredGeometry.workspace
  const restorationNotice = combinedNotice(
    project.persistenceNote,
    notice,
    restoredGeometry.notice
  )
  const selectedFile = workspace.selectedFile
  if (selectedFile === null) {
    return {
      project,
      workspace,
      documentState: { status: "empty" },
      notice: restorationNotice,
    }
  }

  try {
    const documentState = await loadEditableDocument(project.path, selectedFile)
    return {
      project,
      workspace,
      documentState,
      notice: restorationNotice,
    }
  } catch (error: unknown) {
    return {
      project,
      workspace: { ...workspace, selectedFile: null },
      documentState: {
        status: "error",
        path: selectedFile,
        error: projectErrorFromUnknown(error),
      },
      notice: restorationNotice,
    }
  }
}

function withOpenFeedback(
  current: AppSessionState,
  openFeedback: OpenProjectFeedback
): AppSessionState {
  if (current.status === "starting") return current
  return { ...current, openFeedback }
}

/** Owns startup restoration and the project editing session state machine. */
export function useProjectSession() {
  const [state, setState] = useState<AppSessionState>({ status: "starting" })
  const stateRef = useRef<AppSessionState>(state)
  const documentRequest = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveActionRef = useRef<() => Promise<boolean>>(async () => true)

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

    async function start() {
      try {
        const startup = await loadStartupState()
        if (!active) return
        if (startup.lastWorkspace === null) {
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
          if (!active) return
          setState({
            status: "workspace",
            session,
            openFeedback: { status: "idle" },
          })
          await saveWorkspaceState(session.workspace)
        } catch (error: unknown) {
          if (!active) return
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
  }, [])

  const openProjectAtPath = useCallback(async (path: string) => {
    setState((current) =>
      withOpenFeedback(current, { status: "opening", path })
    )
    try {
      const project = await openProjectFolder(path)
      const session = await hydrateSession(project, null, null)
      setState({
        status: "workspace",
        session,
        openFeedback: { status: "idle" },
      })
      await saveWorkspaceState(session.workspace)
    } catch (error: unknown) {
      setState((current) =>
        withOpenFeedback(current, {
          status: "error",
          error: projectErrorFromUnknown(error),
        })
      )
    }
  }, [])

  const chooseAndOpenProject = useCallback(async () => {
    if (!(await saveActionRef.current())) return
    setState((current) => withOpenFeedback(current, { status: "choosing" }))
    let selectedPath: string | null
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

  const forgetProject = useCallback(async (path: string) => {
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

  const saveActiveDocument = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current
    if (
      current.status !== "workspace" ||
      current.session.documentState.status !== "ready"
    ) {
      return true
    }
    const active = current.session.documentState
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
      const document = await saveProjectSource(
        projectPath,
        path,
        content,
        revision
      )
      setState((value) => {
        if (
          value.status !== "workspace" ||
          value.session.documentState.status !== "ready" ||
          value.session.documentState.document.path !== path
        ) {
          return value
        }
        const unchanged = value.session.documentState.content === content
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
              saveState: unchanged ? { status: "saved" } : { status: "dirty" },
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

  useEffect(() => {
    saveActionRef.current = saveActiveDocument
  }, [saveActiveDocument])

  useEffect(() => {
    const saveOnWindowLoss = () => {
      void saveActionRef.current()
    }
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") saveOnWindowLoss()
    }
    window.addEventListener("blur", saveOnWindowLoss)
    document.addEventListener("visibilitychange", saveWhenHidden)
    return () => {
      window.removeEventListener("blur", saveOnWindowLoss)
      document.removeEventListener("visibilitychange", saveWhenHidden)
    }
  }, [])

  const editDocument = useCallback((path: string, content: string) => {
    const current = stateRef.current
    if (
      current.status !== "workspace" ||
      current.session.documentState.status !== "ready" ||
      current.session.documentState.document.path !== path ||
      current.session.documentState.content === content
    ) {
      return
    }
    const { project } = current.session
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
                content,
                saveState: { status: "dirty" },
              },
            },
          }
    )

    if (recoveryTimer.current === null) {
      recoveryTimer.current = setTimeout(() => {
        recoveryTimer.current = null
        const latest = stateRef.current
        if (
          latest.status !== "workspace" ||
          latest.session.documentState.status !== "ready" ||
          latest.session.documentState.document.path !== path
        ) {
          return
        }
        void saveRecoveryDraft(
          project.path,
          path,
          latest.session.documentState.content,
          latest.session.documentState.document.revision
        ).catch(() => {
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
    }
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveActionRef.current()
    }, 850)
  }, [])

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
    if (!restore) {
      await discardRecoveryDraft(project.path, documentState.document.path)
    }
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
                content: restore
                  ? value.session.documentState.content
                  : value.session.documentState.document.content,
                saveState: restore ? { status: "dirty" } : { status: "saved" },
              },
            },
          }
    )
    if (restore) {
      saveTimer.current = setTimeout(() => void saveActionRef.current(), 250)
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
    const external = documentState.saveState.external
    if (!keepMine) {
      await discardRecoveryDraft(project.path, documentState.document.path)
      setState((value) =>
        value.status !== "workspace"
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
    try {
      const document = await saveProjectSource(
        project.path,
        documentState.document.path,
        documentState.content,
        external.revision
      )
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
                  document,
                  saveState: { status: "saved" },
                },
              },
            }
      )
    } catch (error: unknown) {
      const projectError = projectErrorFromUnknown(error)
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
    async (path: string, pin: boolean) => {
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
        void saveWorkspaceState(workspace)
        return
      }

      if (!(await saveActiveDocument())) return
      const request = ++documentRequest.current
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
        const documentState = await loadEditableDocument(projectPath, path)
        if (request !== documentRequest.current) return
        setState((current) => {
          if (current.status !== "workspace") return current
          const workspace = current.session.workspace
          void saveWorkspaceState({
            ...workspace,
          })
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
    [saveActiveDocument]
  )

  const previewFile = useCallback(
    (path: string) => {
      void openFile(path, false)
    },
    [openFile]
  )

  const pinFile = useCallback(
    (path: string) => {
      void openFile(path, true)
    },
    [openFile]
  )

  const closeFile = useCallback(
    async (path: string) => {
      if (!(await saveActiveDocument())) return
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      const request = ++documentRequest.current
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
      void saveWorkspaceState(workspace)

      if (!closingActiveFile || nextFile === null) return

      try {
        const documentState = await loadEditableDocument(project.path, nextFile)
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
    [saveActiveDocument]
  )

  const closeFiles = useCallback(
    async (paths: string[]) => {
      if (!(await saveActiveDocument())) return
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      const request = ++documentRequest.current
      const { project, workspace: previousWorkspace } = currentState.session
      const workspace = paths.reduce(closeDocument, previousWorkspace)
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
      void saveWorkspaceState(workspace)
      if (!activeFileChanged || nextFile === null) return

      try {
        const documentState = await loadEditableDocument(project.path, nextFile)
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
    [saveActiveDocument]
  )

  const selectRoot = useCallback(
    (path: string) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = { ...current.session.workspace, selectedRoot: path }
        void saveWorkspaceState(workspace)
        return {
          ...current,
          session: { ...current.session, workspace },
        }
      })
      void openFile(path, false)
    },
    [openFile]
  )

  const createProjectEntry = useCallback(
    async (parentPath: string | null, name: string, directory: boolean) => {
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      try {
        await createProjectEntryRequest(
          currentState.session.project.path,
          parentPath,
          name,
          directory
        )
        const project = await openProjectFolder(
          currentState.session.project.path
        )
        setState((current) =>
          current.status !== "workspace"
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
      } catch (error: unknown) {
        const projectError = projectErrorFromUnknown(error)
        setState((current) =>
          current.status !== "workspace"
            ? current
            : {
                ...current,
                session: { ...current.session, notice: projectError.message },
              }
        )
      }
    },
    []
  )

  const renameProjectEntry = useCallback(
    async (path: string, name: string) => {
      if (!(await saveActiveDocument())) return
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      const parent = path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : ""
      const renamedPath = parent === "" ? name : `${parent}/${name}`
      try {
        await renameProjectEntryRequest(
          currentState.session.project.path,
          path,
          name
        )
        const project = await openProjectFolder(
          currentState.session.project.path
        )
        setState((current) => {
          if (current.status !== "workspace") return current
          const workspace = {
            ...current.session.workspace,
            pinnedFiles: current.session.workspace.pinnedFiles.map((file) =>
              renamedProjectPath(file, path, renamedPath)
            ),
            selectedRoot:
              current.session.workspace.selectedRoot === null
                ? null
                : renamedProjectPath(
                    current.session.workspace.selectedRoot,
                    path,
                    renamedPath
                  ),
            selectedFile:
              current.session.workspace.selectedFile === null
                ? null
                : renamedProjectPath(
                    current.session.workspace.selectedFile,
                    path,
                    renamedPath
                  ),
            selectedPdf:
              current.session.workspace.selectedPdf === null
                ? null
                : renamedProjectPath(
                    current.session.workspace.selectedPdf,
                    path,
                    renamedPath
                  ),
            pdfViewerStates: Object.fromEntries(
              Object.entries(current.session.workspace.pdfViewerStates).map(
                ([pdfPath, viewerState]) => [
                  renamedProjectPath(pdfPath, path, renamedPath),
                  viewerState,
                ]
              )
            ),
            editorViewerStates: Object.fromEntries(
              Object.entries(current.session.workspace.editorViewerStates).map(
                ([sourcePath, viewerState]) => [
                  renamedProjectPath(sourcePath, path, renamedPath),
                  viewerState,
                ]
              )
            ),
          }
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
          void saveWorkspaceState(workspace)
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
      } catch (error: unknown) {
        const projectError = projectErrorFromUnknown(error)
        setState((current) =>
          current.status !== "workspace"
            ? current
            : {
                ...current,
                session: { ...current.session, notice: projectError.message },
              }
        )
      }
    },
    [saveActiveDocument]
  )

  const deleteProjectEntry = useCallback(
    async (path: string) => {
      if (!(await saveActiveDocument())) return
      const currentState = stateRef.current
      if (currentState.status !== "workspace") return

      try {
        await deleteProjectEntryRequest(currentState.session.project.path, path)
        const project = await openProjectFolder(
          currentState.session.project.path
        )
        const request = ++documentRequest.current
        const previous = currentState.session.workspace
        const pinnedFiles = previous.pinnedFiles.filter(
          (file) => !isProjectPathWithin(file, path)
        )
        const selectedRoot = isProjectPathWithin(previous.selectedRoot, path)
          ? null
          : previous.selectedRoot
        const nextFile = isProjectPathWithin(previous.selectedFile, path)
          ? (pinnedFiles.at(-1) ?? selectedRoot)
          : previous.selectedFile
        const workspace = {
          ...previous,
          pinnedFiles,
          selectedRoot,
          editorViewerStates: Object.fromEntries(
            Object.entries(previous.editorViewerStates).filter(
              ([sourcePath]) => !isProjectPathWithin(sourcePath, path)
            )
          ),
          selectedFile: nextFile,
          selectedPdf: isProjectPathWithin(previous.selectedPdf, path)
            ? null
            : previous.selectedPdf,
          pdfViewerStates: Object.fromEntries(
            Object.entries(previous.pdfViewerStates).filter(
              ([pdfPath]) => !isProjectPathWithin(pdfPath, path)
            )
          ),
        }
        void saveWorkspaceState(workspace)
        setState((current) => {
          if (current.status !== "workspace") return current
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
        const documentState = await loadEditableDocument(
          currentState.session.project.path,
          nextFile
        )
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
        const projectError = projectErrorFromUnknown(error)
        setState((current) =>
          current.status !== "workspace"
            ? current
            : {
                ...current,
                session: { ...current.session, notice: projectError.message },
              }
        )
      }
    },
    [saveActiveDocument]
  )

  const resizeSidebar = useCallback((width: number, persist: boolean) => {
    setState((current) => {
      if (current.status !== "workspace") return current
      const workspace = {
        ...current.session.workspace,
        sidebarWidth: Math.round(width),
      }
      if (persist) void saveWorkspaceState(workspace)
      return {
        ...current,
        session: { ...current.session, workspace },
      }
    })
  }, [])

  const setEditorFontSize = useCallback((fontSize: number) => {
    setState((current) => {
      if (current.status !== "workspace") return current
      const workspace = {
        ...current.session.workspace,
        editorFontSize: Math.max(11, Math.min(24, fontSize)),
      }
      void saveWorkspaceState(workspace)
      return {
        ...current,
        session: { ...current.session, workspace },
      }
    })
  }, [])

  const openPdf = useCallback((path: string) => {
    setState((current) => {
      if (current.status !== "workspace") return current
      const workspace = { ...current.session.workspace, selectedPdf: path }
      void saveWorkspaceState(workspace)
      return { ...current, session: { ...current.session, workspace } }
    })
  }, [])

  const updatePdfViewerState = useCallback(
    (path: string, viewerState: WorkspaceState["pdfViewerStates"][string]) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = {
          ...current.session.workspace,
          pdfViewerStates: {
            ...current.session.workspace.pdfViewerStates,
            [path]: viewerState,
          },
        }
        void saveWorkspaceState(workspace)
        return { ...current, session: { ...current.session, workspace } }
      })
    },
    []
  )

  const updateEditorViewerState = useCallback(
    (
      path: string,
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
        void saveWorkspaceState(workspace)
        return { ...current, session: { ...current.session, workspace } }
      })
    },
    []
  )

  const updateWorkspaceView = useCallback(
    (
      update: Partial<
        Pick<
          WorkspaceState,
          | "pdfPaneOpen"
          | "pdfPaneWidth"
          | "buildPanelOpen"
          | "buildPanelHeight"
          | "sidebarTab"
          | "buildPanelTab"
          | "buildProfile"
        >
      >
    ) => {
      setState((current) => {
        if (current.status !== "workspace") return current
        const workspace = { ...current.session.workspace, ...update }
        void saveWorkspaceState(workspace)
        return { ...current, session: { ...current.session, workspace } }
      })
    },
    []
  )

  const refreshActiveDocument = useCallback(async () => {
    const current = stateRef.current
    if (
      current.status !== "workspace" ||
      current.session.documentState.status !== "ready" ||
      current.session.documentState.saveState.status !== "saved"
    ) {
      return
    }
    const path = current.session.documentState.document.path
    try {
      const documentState = await loadEditableDocument(
        current.session.project.path,
        path
      )
      setState((value) =>
        value.status !== "workspace" ||
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

    try {
      const project = await openProjectFolder(current.session.project.path)
      setState((value) =>
        value.status !== "workspace" ||
        value.session.project.path !== current.session.project.path
          ? value
          : {
              ...value,
              session: { ...value.session, project },
            }
      )
    } catch {
      // A transient external filesystem change must not disturb the current workspace.
    }
    await refreshActiveDocument()
  }, [refreshActiveDocument])

  const returnHome = useCallback(async () => {
    if (!(await saveActionRef.current())) return
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
