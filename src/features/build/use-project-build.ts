import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import type { Dispatch } from "react"

import {
  initialProjectBuildState,
  projectBuildReducer,
  type BuildEngine,
  type BuildProfilesState,
  type ProjectBuildAction,
  type BuildRequest,
  type ProjectBuildConfiguration,
  type ProjectBuildConfigurationState,
  type ProjectBuildState,
} from "@/domain/build"
import {
  projectRelativePath,
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import { projectErrorFromUnknown } from "@/services/project-service"
import {
  getBuildHistory,
  getBuildProfiles,
  listenForBuildEvents,
  previewBuild,
  startBuild,
  stopBuild,
  loadProjectBuildConfiguration,
  saveProjectBuildConfiguration,
} from "@/services/build-service"
import { createSerialTaskQueue } from "@/lib/serial-task-queue"

const saveRequiredError = {
  code: "build-save-required",
  message: "Save or resolve the active source file before building.",
}

export type ProjectBuildController = Readonly<{
  state: ProjectBuildState
  profiles: BuildProfilesState
  engine: BuildEngine
  setEngine: (engine: BuildEngine) => void
  build: () => Promise<void>
  refreshProfiles: () => void
  stop: () => Promise<void>
  dispatch: Dispatch<ProjectBuildAction>
  configurationState: ProjectBuildConfigurationState
  saveConfiguration: (
    configuration: ProjectBuildConfiguration
  ) => Promise<ProjectBuildConfiguration>
}>

export function useProjectBuild({
  beforeBuild,
  initialEngine,
  onEngineChange,
  projectPath,
  rootFile,
}: {
  beforeBuild: () => Promise<boolean>
  initialEngine: BuildEngine
  onEngineChange: (engine: BuildEngine) => void
  projectPath: CanonicalProjectPath
  rootFile: ProjectRelativePath | null
}): ProjectBuildController {
  const [state, dispatch] = useReducer(
    projectBuildReducer,
    initialProjectBuildState
  )
  const [engine, setEngineState] = useState<BuildEngine>(initialEngine)
  const [profiles, setProfiles] = useState<BuildProfilesState>({
    status: "loading",
  })
  const [configurationState, setConfigurationState] =
    useState<ProjectBuildConfigurationState>({ status: "loading" })
  const activeProject = useRef(projectPath)
  const operationRevision = useRef(0)
  const buildInFlight = useRef(false)
  const configurationSaveRevision = useRef(0)
  const configurationSaveQueue = useRef(createSerialTaskQueue())
  activeProject.current = projectPath

  useEffect(() => {
    operationRevision.current += 1
    buildInFlight.current = false
    return () => {
      operationRevision.current += 1
      configurationSaveRevision.current += 1
    }
  }, [projectPath])

  useEffect(() => {
    let active = true
    void loadProjectBuildConfiguration(projectPath)
      .then((configuration) => {
        if (active) setConfigurationState({ status: "ready", configuration })
      })
      .catch((error: unknown) => {
        if (active) {
          setConfigurationState({
            status: "error",
            error: projectErrorFromUnknown(error),
          })
        }
      })
    return () => {
      active = false
    }
  }, [projectPath])

  // Bumped when the LaTeX tools change on disk underneath a running TeX. Both
  // the installed-profile list and the build preview are derived from the same
  // detection, so they must be re-resolved together or the panel keeps showing
  // a preview error for a tool that now exists.
  const [toolsRevision, setToolsRevision] = useState(0)
  useEffect(() => {
    let active = true
    void getBuildProfiles()
      .then((availableProfiles) => {
        if (!active) return
        setProfiles({ status: "ready", profiles: availableProfiles })
      })
      .catch((error: unknown) => {
        if (!active) return
        const projectError = projectErrorFromUnknown(error)
        setProfiles({ status: "error", error: projectError })
        dispatch({ type: "actionError", error: projectError })
      })
    return () => {
      active = false
    }
  }, [toolsRevision])

  /** Re-detects the installed tools after the environment changes underneath TeX. */
  const refreshProfiles = useCallback((): void => {
    dispatch({ type: "actionCleared" })
    setToolsRevision((revision) => revision + 1)
  }, [])

  const setEngine = useCallback(
    (next: BuildEngine) => {
      setEngineState(next)
      onEngineChange(next)
    },
    [onEngineChange]
  )

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null
    void listenForBuildEvents((event) => {
      if (active && event.projectPath === projectPath) {
        dispatch({ type: "eventReceived", event })
      }
    })
      .then((cleanup) => {
        if (active) unlisten = cleanup
        else cleanup()
      })
      .catch((error: unknown) => {
        if (active) {
          dispatch({
            type: "actionError",
            error: projectErrorFromUnknown(error),
          })
        }
      })
    void getBuildHistory(projectPath)
      .then((runs) => {
        if (active) dispatch({ type: "historyLoaded", runs })
      })
      .catch((error: unknown) => {
        if (active) {
          dispatch({
            type: "historyError",
            error: projectErrorFromUnknown(error),
          })
        }
      })
    return () => {
      active = false
      unlisten?.()
    }
  }, [projectPath])

  const buildRunning = state.runs.some((run) => run.status === "running")
  useEffect(() => {
    if (!buildRunning) return
    let active = true
    let reconciliationInFlight = false
    const reconcile = (): void => {
      if (reconciliationInFlight) return
      reconciliationInFlight = true
      void getBuildHistory(projectPath)
        .then((runs) => {
          if (active) dispatch({ type: "historyLoaded", runs })
        })
        .catch(() => {
          // The visible run and its retained output remain available for retry.
        })
        .finally(() => {
          reconciliationInFlight = false
        })
    }
    const interval = window.setInterval(reconcile, 1_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [buildRunning, projectPath])

  useEffect(() => {
    let active = true
    if (configurationState.status !== "ready") {
      dispatch({
        type: "rootUnavailable",
        reason:
          configurationState.status === "loading"
            ? "Loading project build settings…"
            : configurationState.error.message,
      })
      return () => {
        active = false
      }
    }
    const effectiveRoot = configurationState.configuration.rootFile ?? rootFile
    if (effectiveRoot === null) {
      dispatch({
        type: "rootUnavailable",
        reason: "Choose a LaTeX root file to prepare a build.",
      })
      return () => {
        active = false
      }
    }
    dispatch({ type: "previewLoading" })
    void previewBuild({
      projectPath,
      rootFile: projectRelativePath(effectiveRoot),
      engine,
    })
      .then((invocation) => {
        if (active) dispatch({ type: "previewReady", invocation })
      })
      .catch((error: unknown) => {
        if (active) {
          dispatch({
            type: "previewError",
            error: projectErrorFromUnknown(error),
          })
        }
      })
    return () => {
      active = false
    }
  }, [configurationState, engine, projectPath, rootFile, toolsRevision])

  const build = useCallback(async (): Promise<void> => {
    if (buildInFlight.current) return
    if (configurationState.status !== "ready") return
    const effectiveRoot = configurationState.configuration.rootFile ?? rootFile
    if (effectiveRoot === null) return
    buildInFlight.current = true
    const revision = operationRevision.current
    const remainsCurrent = (): boolean =>
      revision === operationRevision.current &&
      activeProject.current === projectPath
    dispatch({ type: "actionPending" })
    try {
      if (!(await beforeBuild())) {
        if (remainsCurrent()) {
          dispatch({ type: "actionError", error: saveRequiredError })
        }
        return
      }
      if (!remainsCurrent()) return
      const request: BuildRequest = {
        projectPath,
        rootFile: projectRelativePath(effectiveRoot),
        engine,
      }
      const run = await startBuild(request)
      if (remainsCurrent()) dispatch({ type: "runStarted", run })
    } catch (error: unknown) {
      if (remainsCurrent()) {
        dispatch({
          type: "actionError",
          error: projectErrorFromUnknown(error),
        })
      }
    } finally {
      if (remainsCurrent()) buildInFlight.current = false
    }
  }, [beforeBuild, configurationState, engine, projectPath, rootFile])

  const saveConfiguration = useCallback(
    async (
      configuration: ProjectBuildConfiguration
    ): Promise<ProjectBuildConfiguration> => {
      configurationSaveRevision.current += 1
      const revision = configurationSaveRevision.current
      const saved = await configurationSaveQueue.current.enqueue(() =>
        saveProjectBuildConfiguration(projectPath, configuration)
      )
      if (
        activeProject.current === projectPath &&
        revision === configurationSaveRevision.current
      ) {
        setConfigurationState({ status: "ready", configuration: saved })
      }
      return saved
    },
    [projectPath]
  )

  const stop = useCallback(async (): Promise<void> => {
    const revision = operationRevision.current
    dispatch({ type: "actionPending" })
    try {
      await stopBuild(projectPath)
    } catch (error: unknown) {
      if (
        revision === operationRevision.current &&
        activeProject.current === projectPath
      ) {
        dispatch({
          type: "actionError",
          error: projectErrorFromUnknown(error),
        })
      }
    }
  }, [projectPath])

  return {
    state,
    profiles,
    engine,
    setEngine,
    build,
    refreshProfiles,
    stop,
    dispatch,
    configurationState,
    saveConfiguration,
  }
}
