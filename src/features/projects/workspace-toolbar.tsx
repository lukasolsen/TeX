import {
  CircleStop,
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
import type { BuildRun } from "@/domain/build"

/** Keeps project-level actions separate from the active document surface. */
export function WorkspaceToolbar({
  buildEnabled,
  buildStatus,
  feedback,
  onBuild,
  onOpenProject,
  onOpenCommands,
  onOpenBuild,
  onOpenSearch,
  onReturnHome,
  onSave,
  onOpenSettings,
  onStop,
  session,
}: {
  buildEnabled: boolean
  buildStatus: BuildRun["status"] | null
  feedback: OpenProjectFeedback
  onBuild: () => void
  onOpenProject: () => void
  onOpenCommands: () => void
  onOpenBuild: () => void
  onOpenSearch: () => void
  onReturnHome: () => void
  onSave: () => void
  onOpenSettings: () => void
  onStop: () => void
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
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="shrink-0 truncate text-sm font-semibold">
          {session.project.name}
        </p>
        {session.workspace.selectedFile !== null ? (
          <>
            <span aria-hidden="true" className="text-muted-foreground/60">
              /
            </span>
            <p className="truncate text-xs text-muted-foreground">
              {session.workspace.selectedFile}
            </p>
          </>
        ) : null}
      </div>
      <Button
        disabled={buildStatus !== "running" && !buildEnabled}
        onClick={buildStatus === "running" ? onStop : onBuild}
        size="sm"
        title={buildStatus === "running" ? "Stop build" : "Build PDF"}
        variant={buildStatus === "failed" ? "destructive" : "default"}
      >
        {buildStatus === "running" ? (
          <CircleStop data-icon="inline-start" />
        ) : (
          <Hammer data-icon="inline-start" />
        )}
        {buildStatus === "running" ? "Stop" : "Build PDF"}
      </Button>
      <Button
        aria-label="Show build details"
        onClick={onOpenBuild}
        size="icon-sm"
        title="Show build details (Ctrl+Shift+B)"
        variant="ghost"
      >
        <SquareTerminal aria-hidden="true" />
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
        onClick={onOpenCommands}
        size="sm"
        title="Command palette (Ctrl+Shift+P)"
        variant="ghost"
      >
        <SquareTerminal data-icon="inline-start" />
        <span className="hidden lg:inline">Commands</span>
        <kbd className="hidden rounded border bg-muted px-1 py-0.5 font-sans text-[10px] text-muted-foreground xl:inline">
          Ctrl ⇧ P
        </kbd>
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
