import { useCallback, useEffect, useRef, useState } from "react"

import {
  applyInstallEvent,
  installNotice,
  type InstallMethod,
  type InstallNotice,
  type InstallProgress,
  type LatexInstallState,
} from "@/domain/latex-install"
import {
  getLatexInstallationProgress,
  getLatexInstallationSupport,
  listenForInstallEvents,
  startLatexInstallation,
  stopLatexInstallation,
} from "@/services/latex-install-service"
import { projectErrorFromUnknown } from "@/services/project-service"

export type LatexInstallController = Readonly<{
  state: LatexInstallState
  progress: InstallProgress | null
  running: boolean
  starting: boolean
  startError: string | null
  /** The completion result worth reporting outside the installer, until acknowledged. */
  notice: InstallNotice | null
  install: (method: InstallMethod) => Promise<void>
  stop: () => Promise<void>
  dismiss: () => void
  acknowledgeNotice: () => void
}>

/**
 * Owns the single system-wide LaTeX installation. Detection runs once per
 * window and is repeated after every finished installation so the reported
 * package managers and installed tools stay truthful.
 */
export function useLatexInstall({
  onInstalled,
}: {
  onInstalled: () => void
}): LatexInstallController {
  const [state, setState] = useState<LatexInstallState>({ status: "loading" })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [notice, setNotice] = useState<InstallNotice | null>(null)
  const mounted = useRef(true)
  const startInFlight = useRef(false)
  const reportedCompletion = useRef<string | null>(null)
  const notifyInstalled = useRef(onInstalled)
  notifyInstalled.current = onInstalled

  /**
   * Reports one completion per installation, whichever signal observes it
   * first: the event stream normally, the reconciliation poll if an emission
   * was missed.
   */
  const recordCompletion = useCallback(
    (
      installationId: string,
      outcome: Parameters<typeof installNotice>[0]
    ): void => {
      if (
        outcome.status === "running" ||
        reportedCompletion.current === installationId
      ) {
        return
      }
      reportedCompletion.current = installationId
      setNotice(installNotice(outcome))
      notifyInstalled.current()
    },
    []
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([
      getLatexInstallationSupport(),
      getLatexInstallationProgress(),
    ])
      .then(([support, progress]) => {
        if (active) setState({ status: "ready", support, progress })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "unavailable",
            error: projectErrorFromUnknown(error),
          })
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null
    void listenForInstallEvents((event) => {
      if (!active) return
      setState((current) =>
        current.status === "ready" && current.progress !== null
          ? { ...current, progress: applyInstallEvent(current.progress, event) }
          : current
      )
      if (event.kind === "finished") {
        recordCompletion(event.installationId, event)
        void getLatexInstallationSupport()
          .then((support) => {
            if (active) {
              setState((current) =>
                current.status === "ready" ? { ...current, support } : current
              )
            }
          })
          .catch(() => {
            // The already-detected options remain valid for a retry.
          })
      }
    })
      .then((cleanup) => {
        if (active) unlisten = cleanup
        else cleanup()
      })
      .catch(() => {
        // Without the event stream the dialog falls back to explicit polling.
      })
    return () => {
      active = false
      unlisten?.()
    }
  }, [recordCompletion])

  const progress = state.status === "ready" ? state.progress : null
  const running = progress?.status === "running"

  // The event stream is the primary signal; this reconciliation only repairs a
  // window that missed an emission while it was hidden or throttled.
  useEffect(() => {
    if (!running) return
    let active = true
    const reconcile = (): void => {
      void getLatexInstallationProgress()
        .then((latest) => {
          if (!active || latest === null) return
          setState((current) =>
            current.status === "ready" && current.progress?.id === latest.id
              ? { ...current, progress: latest }
              : current
          )
          recordCompletion(latest.id, latest)
        })
        .catch(() => {
          // The retained progress and log remain visible for the user.
        })
    }
    const interval = window.setInterval(reconcile, 2_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [recordCompletion, running])

  const install = useCallback(async (method: InstallMethod): Promise<void> => {
    if (startInFlight.current) return
    startInFlight.current = true
    setStarting(true)
    setStartError(null)
    setNotice(null)
    try {
      const started = await startLatexInstallation(method)
      if (mounted.current) {
        setState((current) =>
          current.status === "ready"
            ? { ...current, progress: started }
            : current
        )
      }
    } catch (error: unknown) {
      if (mounted.current) {
        setStartError(projectErrorFromUnknown(error).message)
      }
    } finally {
      startInFlight.current = false
      if (mounted.current) setStarting(false)
    }
  }, [])

  const stop = useCallback(async (): Promise<void> => {
    try {
      await stopLatexInstallation()
    } catch (error: unknown) {
      if (mounted.current) setStartError(projectErrorFromUnknown(error).message)
    }
  }, [])

  const acknowledgeNotice = useCallback((): void => setNotice(null), [])

  const dismiss = useCallback((): void => {
    setStartError(null)
    setState((current) =>
      current.status === "ready" && current.progress?.status !== "running"
        ? { ...current, progress: null }
        : current
    )
  }, [])

  return {
    state,
    progress,
    running,
    starting,
    startError,
    notice,
    install,
    stop,
    dismiss,
    acknowledgeNotice,
  }
}
