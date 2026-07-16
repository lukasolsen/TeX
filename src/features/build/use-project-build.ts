import { useCallback, useEffect, useReducer, useState } from "react"

import {
  initialProjectBuildState,
  projectBuildReducer,
  type BuildEngine,
  type BuildProfilesState,
  type BuildRequest,
  type ProjectBuildConfiguration,
  type ProjectBuildConfigurationState,
} from "@/domain/build"
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

const saveRequiredError = {
  code: "build-save-required",
  message: "Save or resolve the active source file before building.",
}

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
  projectPath: string
  rootFile: string | null
}) {
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
    const reconcile = () => {
      void getBuildHistory(projectPath)
        .then((runs) => {
          if (active) dispatch({ type: "historyLoaded", runs })
        })
        .catch(() => {
          // The visible run and its retained output remain available for retry.
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
      rootFile: effectiveRoot,
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
  }, [configurationState, engine, projectPath, rootFile])

  const build = useCallback(async () => {
    if (configurationState.status !== "ready") return
    const effectiveRoot = configurationState.configuration.rootFile ?? rootFile
    if (effectiveRoot === null) return
    dispatch({ type: "actionPending" })
    try {
      if (!(await beforeBuild())) {
        dispatch({ type: "actionError", error: saveRequiredError })
        return
      }
      const request: BuildRequest = {
        projectPath,
        rootFile: effectiveRoot,
        engine,
      }
      const run = await startBuild(request)
      dispatch({ type: "runStarted", run })
    } catch (error: unknown) {
      dispatch({
        type: "actionError",
        error: projectErrorFromUnknown(error),
      })
    }
  }, [beforeBuild, configurationState, engine, projectPath, rootFile])

  const saveConfiguration = useCallback(
    async (configuration: ProjectBuildConfiguration) => {
      const saved = await saveProjectBuildConfiguration(
        projectPath,
        configuration
      )
      setConfigurationState({ status: "ready", configuration: saved })
      return saved
    },
    [projectPath]
  )

  const stop = useCallback(async () => {
    dispatch({ type: "actionPending" })
    try {
      await stopBuild(projectPath)
    } catch (error: unknown) {
      dispatch({
        type: "actionError",
        error: projectErrorFromUnknown(error),
      })
    }
  }, [projectPath])

  return {
    state,
    profiles,
    engine,
    setEngine,
    build,
    stop,
    dispatch,
    configurationState,
    saveConfiguration,
  }
}
