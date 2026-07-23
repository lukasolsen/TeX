import { useCallback, useRef, useState } from "react"

import type { BuildDiagnostic, PackageCandidate } from "@/domain/build"
import {
  installLatexPackage,
  resolveMissingPackage,
} from "@/services/build-service"
import { projectErrorFromUnknown } from "@/services/project-service"

/**
 * Resolving the package reaches the distribution's repository, so it is slow
 * and never part of a build. It runs when someone asks about one diagnostic,
 * and each state it can be in is rendered rather than hidden behind a spinner.
 */
export type PackageRecoveryState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "ready"; candidate: PackageCandidate }
  | { status: "installing"; candidate: PackageCandidate }
  | { status: "installed"; candidate: PackageCandidate }
  | { status: "unresolved"; file: string }
  | { status: "error"; message: string }

export type PackageRecoveryController = Readonly<{
  state: PackageRecoveryState
  /** Looks up which package provides the file this diagnostic names. */
  resolve: (diagnostic: BuildDiagnostic) => Promise<void>
  install: () => Promise<void>
  reset: () => void
}>

/** The file name a `missingPackage` diagnostic is about. */
export function missingPackageFile(diagnostic: BuildDiagnostic): string | null {
  if (diagnostic.code !== "missingPackage") return null
  const quoted = /`([^']+)'/.exec(diagnostic.raw)
  return quoted?.[1] ?? null
}

export function usePackageRecovery({
  onInstalled,
}: {
  /** Reconciles the state the install changed: tools, then a rebuild offer. */
  onInstalled: (packageName: string) => void
}): PackageRecoveryController {
  const [state, setState] = useState<PackageRecoveryState>({ status: "idle" })
  // Each request supersedes the one before it, so a slow lookup for a
  // diagnostic the user has moved on from cannot overwrite a newer answer.
  const revision = useRef(0)

  const reset = useCallback(() => {
    revision.current += 1
    setState({ status: "idle" })
  }, [])

  const resolve = useCallback(
    async (diagnostic: BuildDiagnostic): Promise<void> => {
      const file = missingPackageFile(diagnostic)
      if (file === null) return
      revision.current += 1
      const current = revision.current
      setState({ status: "resolving" })
      try {
        const candidate = await resolveMissingPackage(file)
        if (revision.current !== current) return
        setState(
          candidate === null
            ? { status: "unresolved", file }
            : { status: "ready", candidate }
        )
      } catch (error: unknown) {
        if (revision.current !== current) return
        setState({
          status: "error",
          message: projectErrorFromUnknown(error).message,
        })
      }
    },
    []
  )

  const install = useCallback(async (): Promise<void> => {
    if (state.status !== "ready") return
    const { candidate } = state
    revision.current += 1
    const current = revision.current
    setState({ status: "installing", candidate })
    try {
      await installLatexPackage(candidate.package)
      if (revision.current !== current) return
      setState({ status: "installed", candidate })
      onInstalled(candidate.package)
    } catch (error: unknown) {
      if (revision.current !== current) return
      setState({
        status: "error",
        message: projectErrorFromUnknown(error).message,
      })
    }
  }, [onInstalled, state])

  return { state, resolve, install, reset }
}
