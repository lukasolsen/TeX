import { useCallback, useEffect, useRef, useState } from "react"

import type { WatchStatus } from "@/domain/build"
import type { CanonicalProjectPath } from "@/domain/identifiers"
import { projectErrorFromUnknown } from "@/services/project-service"
import {
  acknowledgeProjectWatchBuild,
  getProjectWatchStatus,
  listenForWatchEvents,
  startProjectWatch,
  stopProjectWatch,
} from "@/services/build-service"

export type ProjectWatchState = {
  status: WatchStatus
  message: string | null
}

export type ProjectWatchController = Readonly<{
  state: ProjectWatchState
  start: () => Promise<void>
  stop: () => Promise<void>
  active: boolean
}>

export function useProjectWatch({
  build,
  buildRunning,
  onFilesChanged,
  projectPath,
}: {
  build: () => Promise<void>
  buildRunning: boolean
  onFilesChanged: () => void
  projectPath: CanonicalProjectPath
}): ProjectWatchController {
  const [state, setState] = useState<ProjectWatchState>({
    status: "off",
    message: null,
  })
  const [buildQueued, setBuildQueued] = useState(false)
  const lifecycleRevision = useRef(0)
  const activeProject = useRef(projectPath)
  activeProject.current = projectPath
  // Read through a ref so an inline callback cannot tear down and re-register
  // the event listener on every render, which drops events in between.
  const onFilesChangedRef = useRef(onFilesChanged)
  onFilesChangedRef.current = onFilesChanged

  useEffect(() => {
    lifecycleRevision.current += 1
    return () => {
      lifecycleRevision.current += 1
    }
  }, [projectPath])

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null
    let statusEventRevision = 0
    void getProjectWatchStatus(projectPath)
      .then((status) => {
        if (active && statusEventRevision === 0) {
          if (status === "buildQueued") setBuildQueued(true)
          setState({ status, message: null })
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          status: "error",
          message: projectErrorFromUnknown(error).message,
        })
      })
    void listenForWatchEvents((event) => {
      if (!active || event.projectPath !== projectPath) return
      statusEventRevision += 1
      if (event.kind === "changed") {
        onFilesChangedRef.current()
        return
      }
      if (event.status === "buildQueued") setBuildQueued(true)
      setState({ status: event.status, message: event.message })
    })
      .then((cleanup) => {
        if (active) unlisten = cleanup
        else cleanup()
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: projectErrorFromUnknown(error).message,
          })
        }
      })
    return () => {
      active = false
      unlisten?.()
    }
  }, [projectPath])

  const watchActive = !["off", "error", "pausedUnsafe"].includes(state.status)

  useEffect(() => {
    if (!buildQueued || buildRunning || !watchActive) return
    let active = true
    const frame = window.requestAnimationFrame(() => {
      setBuildQueued(false)
      setState({ status: "watching", message: null })
      void acknowledgeProjectWatchBuild(projectPath)
        .then(() => (active ? build() : undefined))
        .catch((error: unknown) => {
          if (active) {
            setState({
              status: "error",
              message: projectErrorFromUnknown(error).message,
            })
          }
        })
    })
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
    }
  }, [build, buildQueued, buildRunning, projectPath, watchActive])

  const start = useCallback(async (): Promise<void> => {
    const revision = ++lifecycleRevision.current
    setState({ status: "starting", message: null })
    try {
      await startProjectWatch(projectPath)
    } catch (error: unknown) {
      if (
        revision === lifecycleRevision.current &&
        activeProject.current === projectPath
      ) {
        setState({
          status: "error",
          message: projectErrorFromUnknown(error).message,
        })
      }
    }
  }, [projectPath])

  const stop = useCallback(async (): Promise<void> => {
    const revision = ++lifecycleRevision.current
    setState({ status: "stopping", message: null })
    try {
      await stopProjectWatch(projectPath)
    } catch (error: unknown) {
      if (
        revision === lifecycleRevision.current &&
        activeProject.current === projectPath
      ) {
        setState({
          status: "error",
          message: projectErrorFromUnknown(error).message,
        })
      }
    }
  }, [projectPath])

  const visibleState: ProjectWatchState =
    buildRunning && watchActive ? { status: "building", message: null } : state

  return { state: visibleState, start, stop, active: watchActive }
}
