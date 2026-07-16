import { useState } from "react"
import {
  CircleAlert,
  FileCode2,
  LoaderCircle,
  Save,
  ShieldAlert,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { AsyncDocumentState, EditorViewerState } from "@/domain/project"
import type { ProjectEntry } from "@/domain/project"
import { LatexEditor, type EditorTarget } from "@/features/editor/latex-editor"
import { shortcutLabel } from "@/lib/shortcuts"

export function SourceViewer({
  fontSize,
  initialViewerState,
  onChange,
  onCursorChange,
  onOpenReference,
  onResolveConflict,
  onResolveRecovery,
  onSave,
  onViewerStateChange,
  projectPath,
  projectTree,
  retainedPaths,
  state,
  target,
}: {
  fontSize: number
  initialViewerState: EditorViewerState | undefined
  onChange: (path: string, content: string) => void
  onCursorChange: (path: string, line: number, column: number) => void
  onOpenReference: (path: string) => void
  onResolveConflict: (keepMine: boolean) => void
  onResolveRecovery: (restore: boolean) => void
  onSave: () => void
  onViewerStateChange: (path: string, state: EditorViewerState) => void
  projectPath: string
  projectTree: ProjectEntry
  retainedPaths: string[]
  state: AsyncDocumentState
  target: EditorTarget | null
}) {
  const [reviewingConflict, setReviewingConflict] = useState(false)

  if (state.status === "empty") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-source p-6">
        <Empty className="max-w-lg border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Select a source file</EmptyTitle>
            <EmptyDescription>
              Choose a text-based LaTeX project file from the project tree to
              start editing.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  if (state.status === "loading") {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 bg-source p-6"
        role="status"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle
            aria-hidden="true"
            className="motion-safe:animate-spin"
          />
          Reading {state.path}…
        </span>
        <Skeleton className="h-3 w-4/5 rounded" />
        <Skeleton className="h-3 w-3/5 rounded" />
        <Skeleton className="h-3 w-11/12 rounded" />
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center bg-source p-8">
        <Alert className="max-w-lg" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Couldn&apos;t open {state.path}</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const conflict =
    state.saveState.status === "conflict" ? state.saveState.external : null
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-source">
      {state.saveState.status === "recovery" ? (
        <Alert className="m-2 rounded-lg">
          <Save aria-hidden="true" />
          <AlertTitle>Recovered unsaved edits</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              A local recovery draft is shown. The file on disk has not been
              changed.
            </span>
            <Button onClick={() => onResolveRecovery(true)} size="xs">
              Restore and save
            </Button>
            <Button
              onClick={() => onResolveRecovery(false)}
              size="xs"
              variant="outline"
            >
              Discard draft
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {conflict !== null ? (
        <Alert className="m-2 rounded-lg" variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>File changed outside TeX</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              Your editor content was not overwritten. Review both versions
              before continuing.
            </span>
            <Button
              onClick={() => setReviewingConflict(true)}
              size="xs"
              variant="outline"
            >
              Review changes
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.saveState.status === "error" ? (
        <Alert className="m-2 rounded-lg" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Couldn&apos;t save {state.document.path}</AlertTitle>
          <AlertDescription>
            {state.saveState.error.message} Press{" "}
            {shortcutLabel(["primary", "s"])} to retry.
          </AlertDescription>
        </Alert>
      ) : null}
      <LatexEditor
        content={state.content}
        fontSize={fontSize}
        initialViewerState={initialViewerState}
        label={`Edit ${state.document.path}`}
        onChange={(content) => onChange(state.document.path, content)}
        onCursorChange={(line, column) =>
          onCursorChange(state.document.path, line, column)
        }
        onOpenReference={onOpenReference}
        onSave={onSave}
        onViewerStateChange={onViewerStateChange}
        path={state.document.path}
        projectPath={projectPath}
        projectTree={projectTree}
        retainedPaths={retainedPaths}
        target={target}
      />
      <span aria-live="polite" className="sr-only">
        {state.saveState.status === "saved"
          ? "Changes saved"
          : state.saveState.status === "saving"
            ? "Saving changes"
            : state.saveState.status === "error"
              ? "Changes could not be saved; recovery remains available"
              : ""}
      </span>

      <Dialog
        onOpenChange={setReviewingConflict}
        open={reviewingConflict && conflict !== null}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review external changes</DialogTitle>
            <DialogDescription>
              Compare your editor content with the current file on disk.
              Choosing a version is explicit and cannot silently merge
              conflicting text.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-64 gap-4 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">
              Your editor
              <Textarea
                className="min-h-64 resize-none font-mono text-xs"
                readOnly
                value={state.content}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">
              File on disk
              <Textarea
                className="min-h-64 resize-none font-mono text-xs"
                readOnly
                value={conflict?.content ?? ""}
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={() => (
                setReviewingConflict(false),
                onResolveConflict(false)
              )}
              variant="outline"
            >
              Reload file from disk
            </Button>
            <Button
              onClick={() => (
                setReviewingConflict(false),
                onResolveConflict(true)
              )}
            >
              Keep mine and overwrite disk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
