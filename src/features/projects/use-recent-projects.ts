import { useEffect, useState } from "react"

import type { ProjectError, RecentProject } from "@/domain/project"
import {
  loadStartupState,
  projectErrorFromUnknown,
} from "@/services/project-service"

export type RecentProjectsState =
  | { status: "loading" }
  | { status: "ready"; projects: ReadonlyArray<RecentProject> }
  | { status: "error"; error: ProjectError }

/**
 * Reads this device's recent-project history whenever `active` turns true. The
 * workspace session state does not carry the history once a project is open, so
 * a picker reachable from the workspace has to re-read it rather than render a
 * stale copy — including each entry's availability on disk.
 */
export function useRecentProjects(active: boolean): RecentProjectsState {
  const [state, setState] = useState<RecentProjectsState>({ status: "loading" })

  useEffect(() => {
    if (!active) return
    let live = true
    setState({ status: "loading" })
    loadStartupState()
      .then((startup) => {
        if (live) {
          setState({ status: "ready", projects: startup.recentProjects })
        }
      })
      .catch((error: unknown) => {
        if (live) {
          setState({ status: "error", error: projectErrorFromUnknown(error) })
        }
      })
    return () => {
      live = false
    }
  }, [active])

  return state
}
