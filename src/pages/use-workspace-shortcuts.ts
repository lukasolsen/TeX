import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import type { WorkspaceViewUpdate } from "@/domain/project"
import type { ProjectBuildController } from "@/features/build/use-project-build"
import { runDetached } from "@/lib/promises"

type UseWorkspaceShortcutsParams = {
  shortcutsEnabled: boolean
  buildEnabled: boolean
  pdfOpen: boolean
  editorFontSize: number
  build: ProjectBuildController
  onUpdateWorkspaceView: (update: WorkspaceViewUpdate) => void
  onReturnHome: () => void
  onSaveDocument: () => Promise<boolean>
  onSetEditorFontSize: (fontSize: number) => void
  toggleTerminal: () => void
}

type WorkspaceShortcuts = {
  commandPaletteOpen: boolean
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
}

/**
 * Wires the workspace's global keyboard shortcuts and the `tex:*` custom events
 * the command palette and menus dispatch. It owns the command-palette and
 * project-search open flags, which no other state depends on, and calls back
 * into the build, save, view, and terminal actions the page passes in.
 */
export function useWorkspaceShortcuts({
  shortcutsEnabled,
  buildEnabled,
  pdfOpen,
  editorFontSize,
  build,
  onUpdateWorkspaceView,
  onReturnHome,
  onSaveDocument,
  onSetEditorFontSize,
  toggleTerminal,
}: UseWorkspaceShortcutsParams): WorkspaceShortcuts {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const openCommandPalette = () => setCommandPaletteOpen(true)
    window.addEventListener("tex:open-command-palette", openCommandPalette)
    return () =>
      window.removeEventListener("tex:open-command-palette", openCommandPalette)
  }, [])

  useEffect(() => {
    if (!shortcutsEnabled) return
    const runWorkspaceAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      switch (event.detail) {
        case "build":
          if (buildEnabled) runDetached(build.build())
          break
        case "build-details":
          onUpdateWorkspaceView({ buildPanelOpen: true })
          break
        case "find-source":
          window.dispatchEvent(new Event("tex:open-source-find"))
          break
        case "project-home":
          onReturnHome()
          break
        case "save":
          runDetached(onSaveDocument())
          break
        case "search-project":
          setSearchOpen(true)
          break
        case "toggle-pdf":
          onUpdateWorkspaceView({ pdfPaneOpen: !pdfOpen })
          break
      }
    }
    window.addEventListener("tex:workspace-action", runWorkspaceAction)
    return () =>
      window.removeEventListener("tex:workspace-action", runWorkspaceAction)
  }, [
    build,
    buildEnabled,
    onReturnHome,
    onSaveDocument,
    onUpdateWorkspaceView,
    pdfOpen,
    shortcutsEnabled,
  ])

  useEffect(() => {
    if (!shortcutsEnabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault()
        setCommandPaletteOpen(true)
      } else if (
        modifier &&
        event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault()
        onUpdateWorkspaceView({ buildPanelOpen: true })
      } else if (
        modifier &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault()
        setSearchOpen(true)
      } else if (
        modifier &&
        !event.shiftKey &&
        event.key.toLowerCase() === "j"
      ) {
        event.preventDefault()
        toggleTerminal()
      } else if (modifier && (event.key === "+" || event.key === "=")) {
        event.preventDefault()
        onSetEditorFontSize(editorFontSize + 1)
      } else if (modifier && event.key === "-") {
        event.preventDefault()
        onSetEditorFontSize(editorFontSize - 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    editorFontSize,
    onSetEditorFontSize,
    onUpdateWorkspaceView,
    shortcutsEnabled,
    toggleTerminal,
  ])

  return {
    commandPaletteOpen,
    setCommandPaletteOpen,
    searchOpen,
    setSearchOpen,
  }
}
