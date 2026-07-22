import { useEffect, useId, useRef, useState, type ReactElement } from "react"
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileCode2,
  LoaderCircle,
  Save,
  Search,
  ShieldAlert,
  X,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
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
import type {
  AsyncDocumentState,
  EditorDocumentChange,
  EditorViewerState,
} from "@/domain/project"
import type { ProjectEntry } from "@/domain/project"
import type { AppPreferences } from "@/domain/preferences"
import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import { LatexEditor, type EditorTarget } from "@/features/editor/latex-editor"
import { ImageViewer } from "@/features/projects/image-viewer"
import type { EditorPosition } from "@/features/editor/latex-navigation"
import { shortcutLabel } from "@/lib/shortcuts"
import { cn } from "@/lib/utils"

export function SourceViewer({
  fontSize,
  preferences,
  initialViewerState,
  onChange,
  onCursorChange,
  onDiagnosticsChange,
  onOpenReference,
  onReport,
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
  preferences: AppPreferences
  initialViewerState: EditorViewerState | undefined
  onChange: (path: ProjectRelativePath, change: EditorDocumentChange) => void
  onCursorChange: (
    path: ProjectRelativePath,
    line: number,
    column: number
  ) => void
  onDiagnosticsChange: (
    path: ProjectRelativePath,
    diagnostics: readonly LatexDiagnosticEntry[],
    projectAnalysisComplete: boolean
  ) => void
  onOpenReference: (
    path: ProjectRelativePath,
    position: EditorPosition | null
  ) => void
  onReport: (message: string) => void
  onResolveConflict: (keepMine: boolean) => void
  onResolveRecovery: (restore: boolean) => void
  onSave: () => void
  onViewerStateChange: (
    path: ProjectRelativePath,
    state: EditorViewerState
  ) => void
  projectPath: CanonicalProjectPath
  projectTree: ProjectEntry
  retainedPaths: ReadonlyArray<ProjectRelativePath>
  state: AsyncDocumentState
  target: EditorTarget | null
}): ReactElement {
  const editorConflictId = useId()
  const diskConflictId = useId()
  const [reviewingConflict, setReviewingConflict] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState("")
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replacement, setReplacement] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regexp, setRegexp] = useState(false)
  const [findStatus, setFindStatus] = useState<{
    matches: number
    valid: boolean
  } | null>(null)
  const findInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const openFind = () => setFindOpen(true)
    window.addEventListener("tex:open-source-find", openFind)
    return () => window.removeEventListener("tex:open-source-find", openFind)
  }, [])

  useEffect(() => {
    const updateStatus = (event: Event) => {
      if (
        !(event instanceof CustomEvent) ||
        typeof event.detail !== "object" ||
        event.detail === null
      )
        return
      if (
        typeof event.detail.matches === "number" &&
        typeof event.detail.valid === "boolean"
      )
        setFindStatus(event.detail)
    }
    window.addEventListener("tex:source-find-status", updateStatus)
    return () =>
      window.removeEventListener("tex:source-find-status", updateStatus)
  }, [])

  useEffect(() => {
    if (!findOpen) return
    findInput.current?.focus()
  }, [findOpen])

  const updateFind = (
    query: string,
    next = { caseSensitive, wholeWord, regexp }
  ) => {
    setFindQuery(query)
    window.dispatchEvent(
      new CustomEvent("tex:source-find", { detail: { query, ...next } })
    )
  }

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

  if (state.status === "image") {
    return <ImageViewer image={state.image} />
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
    <div className="relative flex min-h-0 flex-1 flex-col bg-source">
      {findOpen ? (
        <div className="absolute top-2 right-3 z-20 flex w-[min(34rem,calc(100%-1.5rem))] flex-col gap-1 rounded-md border bg-popover p-1 shadow-overlay">
          <div className="flex items-center gap-1">
            <InputGroup className="min-w-0 flex-1">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Find in source"
                onChange={(event) => updateFind(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    window.dispatchEvent(
                      new Event(
                        event.shiftKey
                          ? "tex:source-find-previous"
                          : "tex:source-find-next"
                      )
                    )
                  }
                  if (event.key === "Escape") setFindOpen(false)
                }}
                placeholder="Find in source"
                ref={findInput}
                value={findQuery}
              />
            </InputGroup>
            <Button
              aria-label="Previous search result"
              onClick={() =>
                window.dispatchEvent(new Event("tex:source-find-previous"))
              }
              size="icon-xs"
              variant="ghost"
            >
              <ChevronLeft />
            </Button>
            <Button
              aria-label="Match case"
              aria-pressed={caseSensitive}
              onClick={() => {
                const next = !caseSensitive
                setCaseSensitive(next)
                updateFind(findQuery, {
                  caseSensitive: next,
                  wholeWord,
                  regexp,
                })
              }}
              size="icon-xs"
              variant={caseSensitive ? "secondary" : "ghost"}
            >
              Aa
            </Button>
            <Button
              aria-label="Match whole word"
              aria-pressed={wholeWord}
              onClick={() => {
                const next = !wholeWord
                setWholeWord(next)
                updateFind(findQuery, {
                  caseSensitive,
                  wholeWord: next,
                  regexp,
                })
              }}
              size="icon-xs"
              variant={wholeWord ? "secondary" : "ghost"}
            >
              W
            </Button>
            <Button
              aria-label="Use regular expression"
              aria-pressed={regexp}
              onClick={() => {
                const next = !regexp
                setRegexp(next)
                updateFind(findQuery, {
                  caseSensitive,
                  wholeWord,
                  regexp: next,
                })
              }}
              size="icon-xs"
              variant={regexp ? "secondary" : "ghost"}
            >
              .*
            </Button>
            <Button
              aria-label="Show replace"
              aria-pressed={replaceOpen}
              onClick={() => setReplaceOpen((open) => !open)}
              size="xs"
              variant={replaceOpen ? "secondary" : "ghost"}
            >
              Replace
            </Button>
            <Button
              aria-label="Next search result"
              onClick={() =>
                window.dispatchEvent(new Event("tex:source-find-next"))
              }
              size="icon-xs"
              variant="ghost"
            >
              <ChevronRight />
            </Button>
            <Button
              aria-label="Close source find"
              onClick={() => setFindOpen(false)}
              size="icon-xs"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
          {findQuery !== "" && findStatus !== null ? (
            <span
              className={cn(
                "px-1 text-meta",
                findStatus.valid && findStatus.matches > 0
                  ? "text-muted-foreground"
                  : "text-destructive"
              )}
            >
              {findStatus.valid
                ? findStatus.matches === 0
                  ? "No results"
                  : `${findStatus.matches} results`
                : "Invalid expression"}
            </span>
          ) : null}
          {replaceOpen ? (
            <div className="flex items-center gap-1">
              <InputGroup className="min-w-0 flex-1">
                <InputGroupInput
                  aria-label="Replace in source"
                  onChange={(event) => setReplacement(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      window.dispatchEvent(
                        new CustomEvent("tex:source-replace", {
                          detail: {
                            query: findQuery,
                            replacement,
                            action: event.shiftKey ? "all" : "next",
                          },
                        })
                      )
                    }
                    if (event.key === "Escape") setFindOpen(false)
                  }}
                  placeholder="Replace with"
                  value={replacement}
                />
              </InputGroup>
              <Button
                disabled={findQuery === ""}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("tex:source-replace", {
                      detail: { query: findQuery, replacement, action: "next" },
                    })
                  )
                }
                size="xs"
                variant="ghost"
              >
                Replace
              </Button>
              <Button
                disabled={findQuery === ""}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("tex:source-replace", {
                      detail: { query: findQuery, replacement, action: "all" },
                    })
                  )
                }
                size="xs"
                variant="ghost"
              >
                All
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
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
        preferences={preferences}
        initialViewerState={initialViewerState}
        label={`Edit ${state.document.path}`}
        onChange={(change) => onChange(state.document.path, change)}
        onCursorChange={(line, column) =>
          onCursorChange(state.document.path, line, column)
        }
        onDiagnosticsChange={onDiagnosticsChange}
        onOpenReference={onOpenReference}
        onOpenFind={() => setFindOpen(true)}
        onReport={onReport}
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
            <label
              className="flex min-w-0 flex-col gap-2 text-xs font-medium"
              htmlFor={editorConflictId}
            >
              Your editor
              <Textarea
                className="min-h-64 resize-none font-mono text-xs"
                id={editorConflictId}
                readOnly
                value={state.content}
              />
            </label>
            <label
              className="flex min-w-0 flex-col gap-2 text-xs font-medium"
              htmlFor={diskConflictId}
            >
              File on disk
              <Textarea
                className="min-h-64 resize-none font-mono text-xs"
                id={diskConflictId}
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
