import { useCallback, useEffect, useState } from "react"

import type { WatchStatus } from "@/domain/build"
import { projectErrorFromUnknown } from "@/services/project-service"
import {
  getProjectWatchStatus,
  listenForWatchEvents,
  startProjectWatch,
  stopProjectWatch,
} from "@/services/build-service"

export type ProjectWatchState = {
  status: WatchStatus
  message: string | null
}

export function useProjectWatch({
  build,
  buildRunning,
  onFilesChanged,
  projectPath,
}: {
  build: () => Promise<void>
  buildRunning: boolean
  onFilesChanged: () => void
  projectPath: string
}) {
  const [state, setState] = useState<ProjectWatchState>({
    status: "off",
    message: null,
  })
  const [buildQueued, setBuildQueued] = useState(false)

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null
    void getProjectWatchStatus(projectPath)
      .then((status) => {
        if (active) setState({ status, message: null })
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
      if (event.kind === "changed") {
        onFilesChanged()
        return
      }
      if (event.status === "buildQueued") setBuildQueued(true)
      setState({ status: event.status, message: event.message })
    }).then((cleanup) => {
      if (active) unlisten = cleanup
      else cleanup()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [onFilesChanged, projectPath])

  const watchActive = !["off", "error", "pausedUnsafe"].includes(state.status)

  useEffect(() => {
    if (!buildQueued || buildRunning || !watchActive) return
    const frame = window.requestAnimationFrame(() => {
      setBuildQueued(false)
      setState({ status: "watching", message: null })
      void build()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [build, buildQueued, buildRunning, watchActive])

  const start = useCallback(async () => {
    setState({ status: "starting", message: null })
    try {
      await startProjectWatch(projectPath)
    } catch (error: unknown) {
      setState({
        status: "error",
        message: projectErrorFromUnknown(error).message,
      })
    }
  }, [projectPath])

  const stop = useCallback(async () => {
    setState({ status: "stopping", message: null })
    try {
      await stopProjectWatch(projectPath)
    } catch (error: unknown) {
      setState({
        status: "error",
        message: projectErrorFromUnknown(error).message,
      })
    }
  }, [projectPath])

  const visibleState: ProjectWatchState =
    buildRunning && watchActive ? { status: "building", message: null } : state

  return { state: visibleState, start, stop, active: watchActive }
}
