import { useEffect, useRef } from "react"

import type { CanonicalProjectPath } from "@/domain/identifiers"
import { projectErrorFromUnknown } from "@/services/project-service"

import {
  listenForProjectFileEvents,
  startProjectTreeWatch,
  stopProjectTreeWatch,
} from "@/services/build-service"

/** Keeps project navigation in sync with filesystem changes without enabling build watch mode. */
export function useProjectTreeWatch({
  onError,
  onFilesChanged,
  projectPath,
}: {
  onError: (message: string) => void
  onFilesChanged: () => void
  projectPath: CanonicalProjectPath
}): void {
  // Both callbacks are read through refs so a caller passing inline closures
  // cannot restart the watcher on every render: a restart tears the native
  // watch down and back up, and the churn can leave the tree unwatched.
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onFilesChangedRef = useRef(onFilesChanged)
  onFilesChangedRef.current = onFilesChanged

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null

    void listenForProjectFileEvents((changedProjectPath) => {
      if (active && changedProjectPath === projectPath)
        onFilesChangedRef.current()
    })
      .then(async (cleanup) => {
        if (!active) {
          cleanup()
          return
        }
        unlisten = cleanup
        await startProjectTreeWatch(projectPath)
        if (!active) {
          await stopProjectTreeWatch(projectPath)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          onErrorRef.current(projectErrorFromUnknown(error).message)
        }
      })

    return () => {
      active = false
      unlisten?.()
      void stopProjectTreeWatch(projectPath).catch(() => {
        // Teardown is best-effort after this project leaves the active view.
      })
    }
  }, [projectPath])
}
