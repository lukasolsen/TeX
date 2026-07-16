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
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null

    void listenForProjectFileEvents((changedProjectPath) => {
      if (active && changedProjectPath === projectPath) onFilesChanged()
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
  }, [onFilesChanged, projectPath])
}
