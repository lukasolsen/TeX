import {
  FolderOpen,
  Hammer,
  Home,
  Save,
  Search,
  Settings,
  SquareTerminal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { OpenProjectFeedback, ProjectSession } from "@/domain/project"

/** Keeps project-level actions separate from the active document surface. */
export function WorkspaceToolbar({
  feedback,
  onOpenProject,
  onOpenCommands,
  onOpenBuild,
  onOpenSearch,
  onReturnHome,
  onSave,
  onOpenSettings,
  session,
}: {
  feedback: OpenProjectFeedback
  onOpenProject: () => void
  onOpenCommands: () => void
  onOpenBuild: () => void
  onOpenSearch: () => void
  onReturnHome: () => void
  onSave: () => void
  onOpenSettings: () => void
  session: ProjectSession
}) {
  const isOpening =
    feedback.status === "choosing" || feedback.status === "opening"
  const documentState = session.documentState
  const saveUnavailable =
    documentState.status !== "ready" ||
    documentState.saveState.status === "saving" ||
    documentState.saveState.status === "conflict" ||
    documentState.saveState.status === "recovery"

  return (
    <header className="flex min-w-0 items-center gap-2 border-b bg-workspace-chrome px-3">
      <Button
        aria-label="Project home"
        onClick={onReturnHome}
        size="icon-sm"
        title="Project home"
        variant="ghost"
      >
        <Home aria-hidden="true" className="size-6" />
      </Button>
      <Separator className="mx-1" orientation="vertical" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{session.project.name}</p>
      </div>
      <Button
        aria-label="Show build panel"
        onClick={onOpenBuild}
        size="icon-sm"
        title="Show build panel (Ctrl+Shift+B)"
        variant="ghost"
      >
        <Hammer aria-hidden="true" />
      </Button>
      <Button
        aria-label="Save source"
        disabled={saveUnavailable}
        onClick={onSave}
        size="icon-sm"
        title="Save source (Ctrl+S)"
        variant="ghost"
      >
        <Save aria-hidden="true" />
      </Button>
      <Button
        aria-label="Search project"
        onClick={onOpenSearch}
        size="icon-sm"
        title="Search project (Ctrl+Shift+F)"
        variant="ghost"
      >
        <Search aria-hidden="true" />
      </Button>
      <Button
        aria-label="Open settings"
        onClick={onOpenSettings}
        size="icon-sm"
        title="Open settings"
        variant="ghost"
      >
        <Settings aria-hidden="true" />
      </Button>
      <Button
        aria-label="Command palette"
        onClick={onOpenCommands}
        size="icon-sm"
        title="Command palette (Ctrl+Shift+P)"
        variant="ghost"
      >
        <SquareTerminal aria-hidden="true" />
      </Button>
      <Button
        disabled={isOpening}
        onClick={onOpenProject}
        size="sm"
        variant="outline"
      >
        <FolderOpen data-icon="inline-start" />
        <span className="hidden sm:inline">Open project</span>
        <span className="sm:hidden">Open</span>
      </Button>
    </header>
  )
}
