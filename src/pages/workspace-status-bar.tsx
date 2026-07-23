import type { ReactElement } from "react"
import {
  CircleAlert,
  FileText,
  Hammer,
  ListChecks,
  LockKeyhole,
  MapPin,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ProjectRelativePath } from "@/domain/identifiers"
import type { ProjectSummary } from "@/domain/project"
import type { BuildRun } from "@/domain/build"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import { RootFileControl } from "@/features/projects/root-file-control"

type WorkspaceStatusBarProps = {
  activity: string | null
  saveActivity: string | null
  buildOperationMessage: string | null
  latestBuild: BuildRun | null
  onOpenBuild: () => void
  onOpenProblems: () => void
  diagnosticsEnabled: boolean
  problemsAnalysed: boolean
  problemCount: number
  errorCount: number
  watchState: ProjectWatchState
  onToggleWatch: () => void
  editorFontSize: number
  sourceLocation: {
    path: ProjectRelativePath
    line: number
    column: number
  } | null
  selectedFile: ProjectRelativePath | null
  project: ProjectSummary
  selectedRoot: ProjectRelativePath | null
  onSelectRoot: (path: ProjectRelativePath) => void
}

export function WorkspaceStatusBar({
  activity,
  saveActivity,
  buildOperationMessage,
  latestBuild,
  onOpenBuild,
  onOpenProblems,
  diagnosticsEnabled,
  problemsAnalysed,
  problemCount,
  errorCount,
  watchState,
  onToggleWatch,
  editorFontSize,
  sourceLocation,
  selectedFile,
  project,
  selectedRoot,
  onSelectRoot,
}: WorkspaceStatusBarProps): ReactElement {
  return (
    <footer className="flex min-w-0 items-center gap-2 border-t bg-status px-2 text-meta text-status-foreground">
      <span className="flex shrink-0 items-center gap-1.5">
        <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
        Local project
      </span>
      {activity === null &&
      saveActivity === null &&
      buildOperationMessage === null ? null : (
        <>
          <StatusDivider />
          <span className="flex min-w-0 items-center gap-2">
            {activity !== null ? (
              <span className="truncate" role="status">
                {activity}
              </span>
            ) : null}
            {saveActivity !== null ? (
              <span className="truncate" role="status">
                {saveActivity}
              </span>
            ) : null}
            {buildOperationMessage !== null ? (
              <span className="truncate" role="status">
                {buildOperationMessage}
              </span>
            ) : null}
          </span>
        </>
      )}
      <StatusDivider />
      <Button
        className="text-status-foreground hover:bg-status-foreground/10 hover:text-status-foreground"
        onClick={onOpenBuild}
        size="xs"
        variant="ghost"
      >
        <Hammer data-icon="inline-start" />
        {latestBuild === null
          ? "Build ready"
          : latestBuild.status === "running"
            ? "Building"
            : `Build ${latestBuild.status}`}
      </Button>
      <Button
        className="text-status-foreground hover:bg-status-foreground/10 hover:text-status-foreground"
        onClick={onOpenProblems}
        size="xs"
        variant="ghost"
      >
        {errorCount > 0 ? (
          <CircleAlert data-icon="inline-start" />
        ) : (
          <ListChecks data-icon="inline-start" />
        )}
        {/* A build problem is real whether or not the editor is analysing, so
            the count leads and the analysis state only explains a zero. */}
        {problemCount > 0
          ? `${problemCount} ${problemCount === 1 ? "problem" : "problems"}`
          : !diagnosticsEnabled
            ? "Problem analysis off"
            : !problemsAnalysed
              ? "Problems"
              : "No problems"}
      </Button>
      <Button
        className="text-status-foreground hover:bg-status-foreground/10 hover:text-status-foreground"
        onClick={onToggleWatch}
        size="xs"
        variant="ghost"
      >
        {watchState.status === "off"
          ? "Watch off"
          : watchState.status === "error"
            ? "Watch error"
            : `Watch ${watchState.status}`}
      </Button>
      <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-status-foreground/75 md:flex">
        <FileText aria-hidden="true" className="size-3.5" />
        {editorFontSize}px
      </span>
      {sourceLocation?.path === selectedFile ? (
        <span className="hidden shrink-0 items-center gap-1.5 text-status-foreground/75 sm:flex">
          <MapPin aria-hidden="true" className="size-3.5" />
          Ln {sourceLocation.line}, Col {sourceLocation.column}
        </span>
      ) : null}
      <StatusDivider />
      <span className="min-w-0">
        <RootFileControl
          onSelectRoot={onSelectRoot}
          project={project}
          selectedRoot={selectedRoot}
        />
      </span>
    </footer>
  )
}

/** Separates the status bar's groups so they do not read as one run-on line. */
function StatusDivider(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-px shrink-0 bg-status-foreground/20"
    />
  )
}
