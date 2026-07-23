import { CircleAlert, TriangleAlert } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProjectRelativePath } from "@/domain/identifiers"
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import { cn } from "@/lib/utils"

/** Plain-language names, so severity never depends on colour alone. */
const SEVERITY_LABEL = {
  error: "Error",
  warning: "Warning",
} as const

/**
 * The single place a reader looks for everything wrong with the project: what
 * the editor found in the file being written, and what the last build reported.
 * Both groups are always present, so the panel keeps its geometry and a reader
 * never has to work out which of two surfaces holds the answer.
 */
export function ProblemsPanel({
  analysed,
  analysisEnabled,
  buildSection,
  diagnostics,
  onNavigate,
  onOpenSettings,
  path,
  projectAnalysisComplete,
  selectedIndex,
  onSelect,
}: {
  /** False until the editor has reported a result for `path`. */
  analysed: boolean
  /** False when the user turned problem analysis off in settings. */
  analysisEnabled: boolean
  /** The build half of the surface, composed by the workspace page. */
  buildSection: ReactNode
  onOpenSettings: () => void
  diagnostics: readonly LatexDiagnosticEntry[]
  onNavigate: (line: number, column: number) => void
  path: ProjectRelativePath | null
  projectAnalysisComplete: boolean
  selectedIndex: number | null
  onSelect: (index: number) => void
}): ReactElement {
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  const warnings = diagnostics.length - errors
  const counted = path !== null && analysisEnabled && analysed

  return (
    <ScrollArea className="h-full bg-workspace-chrome">
      <ProblemGroup
        detail={
          counted && diagnostics.length > 0
            ? `${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}`
            : null
        }
        title={path ?? "This file"}
      >
        <SourceProblems
          analysed={analysed}
          analysisEnabled={analysisEnabled}
          diagnostics={diagnostics}
          onNavigate={onNavigate}
          onOpenSettings={onOpenSettings}
          path={path}
          projectAnalysisComplete={projectAnalysisComplete}
          onSelect={onSelect}
          selectedIndex={selectedIndex}
        />
      </ProblemGroup>
      <ProblemGroup detail={null} title="Last build">
        {buildSection}
      </ProblemGroup>
    </ScrollArea>
  )
}

/**
 * A labelled band inside the panel. The heading stays put while its own list
 * scrolls, so the origin of a diagnostic is readable at any scroll position.
 */
function ProblemGroup({
  children,
  detail,
  title,
}: {
  children: ReactNode
  detail: string | null
  title: string
}): ReactElement {
  return (
    <section className="border-b last:border-b-0">
      <h3 className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b bg-workspace-chrome px-3 py-1.5 text-meta font-medium tracking-wide text-muted-foreground uppercase">
        <span className="truncate">{title}</span>
        {detail === null ? null : (
          <span className="shrink-0 tracking-normal normal-case tabular-nums">
            {detail}
          </span>
        )}
      </h3>
      {children}
    </section>
  )
}

function SourceProblems({
  analysed,
  analysisEnabled,
  diagnostics,
  onNavigate,
  onOpenSettings,
  path,
  projectAnalysisComplete,
  selectedIndex,
  onSelect,
}: {
  analysed: boolean
  analysisEnabled: boolean
  diagnostics: readonly LatexDiagnosticEntry[]
  onNavigate: (line: number, column: number) => void
  onOpenSettings: () => void
  path: ProjectRelativePath | null
  projectAnalysisComplete: boolean
  selectedIndex: number | null
  onSelect: (index: number) => void
}): ReactElement {
  if (path === null) {
    return (
      <GroupNote>
        No source file open. Open a LaTeX source file to see the problems TeX
        finds in it.
      </GroupNote>
    )
  }

  if (!analysisEnabled) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <p className="text-ui text-muted-foreground">
          Problem analysis is off, so TeX is not checking this file as you type.
        </p>
        <Button onClick={onOpenSettings} size="sm" variant="outline">
          Turn it back on
        </Button>
      </div>
    )
  }

  if (!analysed) {
    // Saying a file is clean before it has been read would be a claim TeX
    // cannot yet make.
    return (
      <GroupNote role="status">
        Checking {path} and the project it belongs to…
      </GroupNote>
    )
  }

  if (diagnostics.length === 0) {
    return (
      <GroupNote>
        {projectAnalysisComplete
          ? "No problems. Structure is balanced and every reference resolves."
          : "No problems. Structure is balanced, but cross-reference checks are limited because TeX could not read every file in this project."}
      </GroupNote>
    )
  }

  return (
    <>
      {projectAnalysisComplete ? null : (
        <p className="px-3 pt-2 text-meta text-muted-foreground">
          Cross-reference checks are limited: TeX could not read every file in
          this project.
        </p>
      )}
      <ul aria-label={`Problems in ${path}`} className="p-1">
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}:${diagnostic.from}:${diagnostic.to}`}>
            <button
              aria-current={index === selectedIndex ? "true" : undefined}
              className={cn(
                "flex min-h-7 w-full min-w-0 items-start gap-2 rounded-md px-2 py-1 text-left text-ui hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                index === selectedIndex && "bg-accent"
              )}
              onClick={() => {
                onSelect(index)
                onNavigate(diagnostic.line, diagnostic.column)
              }}
              type="button"
            >
              {diagnostic.severity === "error" ? (
                <CircleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-destructive"
                />
              ) : (
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="sr-only">
                  {SEVERITY_LABEL[diagnostic.severity]}:{" "}
                </span>
                {diagnostic.message}
              </span>
              <span className="shrink-0 text-meta text-muted-foreground tabular-nums">
                Ln {diagnostic.line}, Col {diagnostic.column}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function GroupNote({
  children,
  role,
}: {
  children: ReactNode
  role?: "status"
}): ReactElement {
  return (
    <p className="px-3 py-2 text-ui text-muted-foreground" role={role}>
      {children}
    </p>
  )
}
