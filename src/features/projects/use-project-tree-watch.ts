import { useEffect } from "react"

import type { CanonicalProjectPath } from "@/domain/identifiers"

import {
  listenForProjectFileEvents,
  startProjectTreeWatch,
  stopProjectTreeWatch,
} from "@/services/build-service"

/** Keeps project navigation in sync with filesystem changes without enabling build watch mode. */
export function useProjectTreeWatch({
  onFilesChanged,
  projectPath,
}: {
  onFilesChanged: () => void
  projectPath: CanonicalProjectPath
}) {
  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null

    void listenForProjectFileEvents((changedProjectPath) => {
      if (active && changedProjectPath === projectPath) onFilesChanged()
    }).then((cleanup) => {
      if (!active) {
        cleanup()
        return
      }
      unlisten = cleanup
      void startProjectTreeWatch(projectPath)
    })

    return () => {
      active = false
      unlisten?.()
      void stopProjectTreeWatch(projectPath)
    }
  }, [onFilesChanged, projectPath])
}
