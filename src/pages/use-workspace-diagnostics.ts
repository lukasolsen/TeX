import { useEffect, useState } from "react"

import type { ProjectRelativePath } from "@/domain/identifiers"
import type { ProjectBuildState } from "@/domain/build"
import { formatDiagnostic, selectedBuildRun } from "@/domain/build"
import type { WorkspaceViewUpdate } from "@/domain/project"
import type { EditorTarget } from "@/features/editor/latex-editor"

type WorkspaceEditorTarget = EditorTarget & { path: ProjectRelativePath }

type UseWorkspaceDiagnosticsParams = {
  buildState: ProjectBuildState
  shortcutsEnabled: boolean
  onUpdateWorkspaceView: (update: WorkspaceViewUpdate) => void
  onPinFile: (path: ProjectRelativePath) => void
  onReport: (message: string) => void
  setTarget: (target: WorkspaceEditorTarget) => void
}

/**
 * Owns navigation across the selected build run's diagnostics: the cursor into
 * the list, the log-context selection, and the handlers the build panel and
 * command palette drive. `buildState`, view/pin updates, and the editor target
 * setter are owned by the page and passed in so this hook stays free of the
 * project session.
 */
export function useWorkspaceDiagnostics({
  buildState,
  shortcutsEnabled,
  onUpdateWorkspaceView,
  onPinFile,
  onReport,
  setTarget,
}: UseWorkspaceDiagnosticsParams) {
  const [diagnosticCursor, setDiagnosticCursor] = useState(0)
  const [logContextSequence, setLogContextSequence] = useState<number | null>(
    null
  )

  const diagnosticRun = selectedBuildRun(buildState)
  const diagnostics = diagnosticRun?.diagnostics ?? []
  const activeDiagnosticIndex =
    diagnostics.length === 0
      ? null
      : Math.min(diagnosticCursor, diagnostics.length - 1)
  const activeDiagnostic =
    activeDiagnosticIndex === null
      ? null
      : (diagnostics[activeDiagnosticIndex] ?? null)

  const selectDiagnostic = (index: number, navigate: boolean) => {
    const diagnostic = diagnostics[index]
    if (diagnostic === undefined) return
    setDiagnosticCursor(index)
    onUpdateWorkspaceView({
      buildPanelOpen: true,
      buildPanelTab: "problems",
    })
    if (
      navigate &&
      diagnostic.file !== null &&
      diagnostic.line !== null &&
      !diagnostic.mappingUncertain
    ) {
      setTarget({
        path: diagnostic.file,
        line: diagnostic.line,
        column: 1,
        token: Date.now(),
      })
      onPinFile(diagnostic.file)
    }
  }

  const moveDiagnostic = (offset: number) => {
    if (diagnostics.length === 0) return
    const current = activeDiagnosticIndex ?? 0
    const next = (current + offset + diagnostics.length) % diagnostics.length
    selectDiagnostic(next, true)
  }

  const copyDiagnostic = async () => {
    const diagnostic = activeDiagnostic ?? diagnostics[0]
    if (diagnostic === undefined) return
    try {
      await navigator.clipboard.writeText(formatDiagnostic(diagnostic))
      onReport("Diagnostic copied")
    } catch {
      onReport("Could not copy the diagnostic")
    }
  }

  const showLogContext = () => {
    const diagnostic = activeDiagnostic ?? diagnostics[0]
    if (diagnostic === undefined) return
    setDiagnosticCursor(Math.max(0, diagnostics.indexOf(diagnostic)))
    setLogContextSequence(diagnostic.logSequence)
    onUpdateWorkspaceView({ buildPanelOpen: true, buildPanelTab: "output" })
  }

  useEffect(() => {
    const onDiagnosticKey = (event: KeyboardEvent) => {
      if (!shortcutsEnabled || event.key !== "F8") return
      event.preventDefault()
      moveDiagnostic(event.shiftKey ? -1 : 1)
    }
    window.addEventListener("keydown", onDiagnosticKey)
    return () => window.removeEventListener("keydown", onDiagnosticKey)
  })

  return {
    diagnostics,
    activeDiagnosticIndex,
    logContextSequence,
    selectDiagnostic,
    moveDiagnostic,
    copyDiagnostic,
    showLogContext,
  }
}
