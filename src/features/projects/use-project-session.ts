import { useCallback, useEffect, useRef, useState } from "react"

import type {
  AppSessionState,
  OpenProjectFeedback,
  ProjectSession,
  ProjectSummary,
  StartupState,
  WorkspaceState,
} from "@/domain/project"
import { closeDocument, openDocument } from "@/features/projects/document-tabs"
import {
  preferredRoot,
  preferredSourceFile,
} from "@/features/projects/project-model"
import {
  chooseProjectFolder,
  createProjectEntry as createProjectEntryRequest,
  deleteProjectEntry as deleteProjectEntryRequest,
  forgetRecentProject,
  loadStartupState,
  openProjectFolder,
  projectErrorFromUnknown,
  readProjectSource,
  renameProjectEntry as renameProjectEntryRequest,
  saveWorkspaceState,
} from "@/services/project-service"

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
  }
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
  const workspace = workspaceForProject(project, restored)
  const selectedFile = workspace.selectedFile
  if (selectedFile === null) {
    return {
      project,
      workspace,
      documentState: { status: "empty" },
      notice: project.persistenceNote ?? notice,
    }
  }

  try {
    const document = await readProjectSource(project.path, selectedFile)
    return {
      project,
      workspace,
      documentState: { status: "ready", document },
      notice: project.persistenceNote ?? notice,
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
      notice: project.persistenceNote ?? notice,
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

/** Owns startup restoration and the complete Phase 1 project-session state machine. */
export function useProjectSession() {
  const [state, setState] = useState<AppSessionState>({ status: "starting" })
  const stateRef = useRef<AppSessionState>(state)
  const documentRequest = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

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

  const openFile = useCallback(async (path: string, pin: boolean) => {
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

    const currentState = stateRef.current
    if (currentState.status !== "workspace") return
    const projectPath = currentState.session.project.path

    try {
      const document = await readProjectSource(projectPath, path)
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
            documentState: { status: "ready", document },
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
  }, [])

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

  const closeFile = useCallback(async (path: string) => {
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
      const document = await readProjectSource(project.path, nextFile)
      if (request !== documentRequest.current) return
      setState((current) => {
        if (current.status !== "workspace") return current
        return {
          ...current,
          session: {
            ...current.session,
            documentState: { status: "ready", document },
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
  }, [])

  const closeFiles = useCallback(async (paths: string[]) => {
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
      const document = await readProjectSource(project.path, nextFile)
      if (request !== documentRequest.current) return
      setState((current) =>
        current.status !== "workspace"
          ? current
          : {
              ...current,
              session: {
                ...current.session,
                documentState: { status: "ready", document },
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
  }, [])

  const selectRoot = useCallback((path: string) => {
    setState((current) => {
      if (current.status !== "workspace") return current
      const workspace = { ...current.session.workspace, selectedRoot: path }
      void saveWorkspaceState(workspace)
      return {
        ...current,
        session: { ...current.session, workspace },
      }
    })
  }, [])

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
        const project = await openProjectFolder(currentState.session.project.path)
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

  const renameProjectEntry = useCallback(async (path: string, name: string) => {
    const currentState = stateRef.current
    if (currentState.status !== "workspace") return

    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
    const renamedPath = parent === "" ? name : `${parent}/${name}`
    try {
      await renameProjectEntryRequest(currentState.session.project.path, path, name)
      const project = await openProjectFolder(currentState.session.project.path)
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
                  path: renamedProjectPath(documentState.path, path, renamedPath),
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
  }, [])

  const deleteProjectEntry = useCallback(async (path: string) => {
    const currentState = stateRef.current
    if (currentState.status !== "workspace") return

    try {
      await deleteProjectEntryRequest(currentState.session.project.path, path)
      const project = await openProjectFolder(currentState.session.project.path)
      const request = ++documentRequest.current
      const previous = currentState.session.workspace
      const pinnedFiles = previous.pinnedFiles.filter(
        (file) => !isProjectPathWithin(file, path)
      )
      const selectedRoot = isProjectPathWithin(previous.selectedRoot, path)
        ? null
        : previous.selectedRoot
      const nextFile = isProjectPathWithin(previous.selectedFile, path)
        ? pinnedFiles.at(-1) ?? selectedRoot
        : previous.selectedFile
      const workspace = {
        ...previous,
        pinnedFiles,
        selectedRoot,
        selectedFile: nextFile,
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
      if (nextFile === null || nextFile === currentState.session.workspace.selectedFile) {
        return
      }
      const document = await readProjectSource(currentState.session.project.path, nextFile)
      if (request !== documentRequest.current) return
      setState((current) =>
        current.status !== "workspace"
          ? current
          : {
              ...current,
              session: {
                ...current.session,
                documentState: { status: "ready", document },
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
  }, [])

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

  const returnHome = useCallback(async () => {
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
    forgetProject,
    openProjectAtPath,
    pinFile,
    previewFile,
    renameProjectEntry,
    resizeSidebar,
    returnHome,
    selectRoot,
    state,
  }
}
