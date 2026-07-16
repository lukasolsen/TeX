import { useEffect, useMemo, useRef, useState } from "react"
import {
  CaseSensitive,
  ChevronRight,
  Replace,
  Search,
  Undo2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type {
  ProjectError,
  ProjectSearchResponse,
  ReplaceResponse,
} from "@/domain/project"
import type { CanonicalProjectPath, ProjectRelativePath } from "@/domain/identifiers"
import {
  projectErrorFromUnknown,
  replaceProjectSources,
  searchProjectSources,
  undoProjectReplace,
} from "@/services/project-service"

type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "ready"; response: ProjectSearchResponse }
  | { status: "error"; error: ProjectError }
  | { status: "replacing"; response: ProjectSearchResponse }
  | { status: "replaced"; result: ReplaceResponse }
  | { status: "undoing"; result: ReplaceResponse }

function previewReplacement(
  context: string,
  query: string,
  replacement: string,
  caseSensitive: boolean
): string {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return context.replace(
    new RegExp(escaped, caseSensitive ? "g" : "gi"),
    () => replacement
  )
}

export function ProjectSearchPanel({
  onClose,
  onFilesChanged,
  onNavigate,
  projectPath,
}: {
  onClose: () => void
  onFilesChanged: () => void
  onNavigate: (path: ProjectRelativePath, line: number, column: number) => void
  projectPath: CanonicalProjectPath
}) {
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [state, setState] = useState<SearchState>({ status: "idle" })
  const request = useRef(0)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchInput.current?.focus()
  }, [])

  useEffect(() => {
    const currentRequest = ++request.current
    if (query.trim() === "") return
    const timer = window.setTimeout(async () => {
      try {
        const response = await searchProjectSources({
          projectPath,
          query,
          caseSensitive,
        })
        if (request.current === currentRequest)
          setState({ status: "ready", response })
      } catch (error: unknown) {
        if (request.current === currentRequest) {
          setState({ status: "error", error: projectErrorFromUnknown(error) })
        }
      }
    }, 220)
    return () => window.clearTimeout(timer)
  }, [caseSensitive, projectPath, query])

  function updateQuery(value: string) {
    setPreviewing(false)
    setQuery(value)
    setState(value.trim() === "" ? { status: "idle" } : { status: "searching" })
  }

  function toggleCaseSensitive() {
    setPreviewing(false)
    setCaseSensitive((value) => !value)
    setState(query.trim() === "" ? { status: "idle" } : { status: "searching" })
  }

  const response =
    state.status === "ready" || state.status === "replacing"
      ? state.response
      : null
  const expectedFiles = useMemo(() => {
    const files = new Map<
      ProjectRelativePath,
      ProjectSearchResponse["results"][number]["revision"]
    >()
    for (const result of response?.results ?? [])
      files.set(result.path, result.revision)
    return [...files].map(([path, revision]) => ({ path, revision }))
  }, [response])

  async function applyReplacement() {
    if (response === null) return
    setState({ status: "replacing", response })
    try {
      const result = await replaceProjectSources({
        projectPath,
        query,
        replacement,
        caseSensitive,
        expectedFiles,
      })
      setPreviewing(false)
      setState({ status: "replaced", result })
      onFilesChanged()
    } catch (error: unknown) {
      setState({ status: "error", error: projectErrorFromUnknown(error) })
    }
  }

  async function undoReplacement(result: ReplaceResponse) {
    setState({ status: "undoing", result })
    try {
      await undoProjectReplace(result.transactionId)
      onFilesChanged()
      const response = await searchProjectSources({
        projectPath,
        query,
        caseSensitive,
      })
      setState({ status: "ready", response })
    } catch (error: unknown) {
      setState({ status: "error", error: projectErrorFromUnknown(error) })
    }
  }

  return (
    <section
      aria-label="Project search"
      className="flex size-full min-h-0 flex-col bg-sidebar"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Search aria-hidden="true" />
        <h2 className="text-xs font-medium">Project search</h2>
        <Button
          aria-label="Close project search"
          className="ml-auto"
          onClick={onClose}
          size="icon-xs"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="flex flex-col gap-2 border-b p-2">
        <div className="flex gap-1">
          <Input
            aria-label="Search project"
            className="min-w-0 flex-1"
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Search project"
            ref={searchInput}
            value={query}
          />
          <Button
            aria-label="Match case"
            aria-pressed={caseSensitive}
            onClick={toggleCaseSensitive}
            size="icon-sm"
            title="Match case"
            variant={caseSensitive ? "secondary" : "ghost"}
          >
            <CaseSensitive aria-hidden="true" />
          </Button>
          <Button
            aria-label="Show replace"
            aria-pressed={showReplace}
            onClick={() => (
              setPreviewing(false),
              setShowReplace((value) => !value)
            )}
            size="icon-sm"
            title="Show replace"
            variant={showReplace ? "secondary" : "ghost"}
          >
            <Replace aria-hidden="true" />
          </Button>
        </div>
        {showReplace ? (
          <div className="flex gap-1">
            <Input
              aria-label="Replace with"
              className="min-w-0 flex-1"
              onChange={(event) => (
                setPreviewing(false),
                setReplacement(event.target.value)
              )}
              placeholder="Replace with"
              value={replacement}
            />
            <Button
              disabled={
                response === null ||
                response.totalMatches === 0 ||
                response.truncated ||
                state.status === "replacing"
              }
              onClick={() => setPreviewing(true)}
              size="sm"
              variant="outline"
            >
              Preview
            </Button>
          </div>
        ) : null}
        {showReplace && response?.truncated ? (
          <p className="text-xs text-muted-foreground">
            Narrow the search before replacing; replacement is disabled when not
            every result can be previewed.
          </p>
        ) : null}
      </div>

      {previewing && response !== null ? (
        <div className="flex flex-col gap-2 border-b bg-muted/40 p-3 text-xs">
          <p>
            Replace {response.totalMatches}{" "}
            {response.totalMatches === 1 ? "match" : "matches"} in{" "}
            {expectedFiles.length}{" "}
            {expectedFiles.length === 1 ? "file" : "files"}. Files will be
            rechecked before writing.
          </p>
          <ul className="flex max-h-36 flex-col gap-2 overflow-y-auto font-mono text-[11px]">
            {response.results.slice(0, 5).map((result, index) => (
              <li
                className="rounded-md bg-background p-2"
                key={`${result.path}:${result.line}:${index}`}
              >
                <span className="block truncate text-muted-foreground">
                  {result.path}:{result.line}
                </span>
                <span className="block truncate">{result.context}</span>
                <span className="block truncate text-primary">
                  →{" "}
                  {previewReplacement(
                    result.context,
                    query,
                    replacement,
                    caseSensitive
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={() => void applyReplacement()} size="xs">
              Apply replacement
            </Button>
            <Button
              onClick={() => setPreviewing(false)}
              size="xs"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {state.status === "idle" ? (
          <p className="p-4 text-sm text-muted-foreground">
            Enter text to search every readable source file in this project.
          </p>
        ) : state.status === "searching" ? (
          <p className="p-4 text-sm text-muted-foreground" role="status">
            Searching project…
          </p>
        ) : state.status === "error" ? (
          <p className="p-4 text-sm text-destructive" role="alert">
            {state.error.message}
          </p>
        ) : state.status === "replacing" ? (
          <p className="p-4 text-sm text-muted-foreground" role="status">
            Validating files and applying replacement…
          </p>
        ) : state.status === "replaced" || state.status === "undoing" ? (
          <div className="flex flex-col gap-3 p-4 text-sm" role="status">
            <p>
              {state.status === "undoing"
                ? "Restoring files…"
                : `Replaced ${state.result.replacedMatches} matches in ${state.result.changedFiles} files.`}
            </p>
            {state.status === "replaced" ? (
              <Button
                onClick={() => void undoReplacement(state.result)}
                size="sm"
                variant="outline"
              >
                <Undo2 data-icon="inline-start" /> Undo replacement
              </Button>
            ) : null}
          </div>
        ) : state.response.results.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No matches in {state.response.searchedFiles} files.
          </p>
        ) : (
          <>
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              {state.response.totalMatches}{" "}
              {state.response.totalMatches === 1 ? "match" : "matches"} in{" "}
              {state.response.searchedFiles} files
              {state.response.truncated ? " · first 500 shown" : ""}
            </p>
            <ol className="p-1.5">
              {state.response.results.map((result, index) => (
                <li
                  key={`${result.path}:${result.line}:${result.column}:${index}`}
                >
                  <button
                    className="flex min-h-12 w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() =>
                      onNavigate(result.path, result.line, result.column)
                    }
                    type="button"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {result.path}:{result.line}:{result.column}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {result.context}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}
