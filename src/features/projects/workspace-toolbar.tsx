import { FolderOpen, Home } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { OpenProjectFeedback, ProjectSession } from "@/domain/project"
import { RootFileControl } from "@/features/projects/root-file-control"

/** Keeps project-level actions separate from the active document surface. */
export function WorkspaceToolbar({
  feedback,
  onOpenProject,
  onReturnHome,
  onSelectRoot,
  session,
}: {
  feedback: OpenProjectFeedback
  onOpenProject: () => void
  onReturnHome: () => void
  onSelectRoot: (path: string) => void
  session: ProjectSession
}) {
  const isOpening =
    feedback.status === "choosing" || feedback.status === "opening"

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
      <RootFileControl
        onSelectRoot={onSelectRoot}
        project={session.project}
        selectedRoot={session.workspace.selectedRoot}
      />
      <Separator className="mx-1 hidden lg:block" orientation="vertical" />
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
