import {
  CircleAlert,
  CircleCheck,
  EyeOff,
  FileCode2,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { ProjectRelativePath } from "@/domain/identifiers"
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import { cn } from "@/lib/utils"

/** Plain-language names, so severity never depends on colour alone. */
const SEVERITY_LABEL = {
  error: "Error",
  warning: "Warning",
} as const

/**
 * The source problems the editor found in the active file: structural mistakes
 * it decided on its own, and cross-reference mistakes the project analysis
 * decided. Compiler diagnostics stay in the Build panel, because they describe
 * a build that happened rather than the text as it stands.
 */
export function ProblemsPanel({
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
  /** False until the editor has reported a result for `path`. */
  analysed: boolean
  /** False when the user turned problem analysis off in settings. */
  analysisEnabled: boolean
  onOpenSettings: () => void
  diagnostics: readonly LatexDiagnosticEntry[]
  onNavigate: (line: number, column: number) => void
  path: ProjectRelativePath | null
  projectAnalysisComplete: boolean
  selectedIndex: number | null
  onSelect: (index: number) => void
}): ReactElement {
  if (path === null) {
    return (
      <Empty className="h-full p-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileCode2 aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-sm">No source file open</EmptyTitle>
          <EmptyDescription className="text-xs">
            Open a LaTeX source file to see the problems TeX finds in it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!analysisEnabled) {
    return (
      <Empty className="h-full p-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EyeOff aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-sm">Problem analysis is off</EmptyTitle>
          <EmptyDescription className="text-xs">
            TeX is not checking this file as you type. Build diagnostics still
            appear in the Build tab.
          </EmptyDescription>
          <Button
            className="mt-2"
            onClick={onOpenSettings}
            size="sm"
            variant="outline"
          >
            Turn it back on
          </Button>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!analysed) {
    // Saying a file is clean before it has been read would be a claim TeX
    // cannot yet make.
    return (
      <Empty className="h-full p-5" role="status">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LoaderCircle
              aria-hidden="true"
              className="motion-safe:animate-spin"
            />
          </EmptyMedia>
          <EmptyTitle className="text-sm">Checking {path}</EmptyTitle>
          <EmptyDescription className="text-xs">
            TeX is reading this file and the project it belongs to.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (diagnostics.length === 0) {
    return (
      <Empty className="h-full p-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheck aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-sm">No problems in {path}</EmptyTitle>
          <EmptyDescription className="text-xs">
            {projectAnalysisComplete
              ? "Structure is balanced and every reference resolves."
              : "Structure is balanced. Cross-reference checks are limited because TeX could not read every file in this project."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  const warnings = diagnostics.length - errors

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-meta text-muted-foreground">
        <span className="truncate font-mono">{path}</span>
        <span aria-hidden="true">·</span>
        <span>
          {errors} {errors === 1 ? "error" : "errors"}, {warnings}{" "}
          {warnings === 1 ? "warning" : "warnings"}
        </span>
        {projectAnalysisComplete ? null : (
          <span className="truncate">
            · Cross-reference checks are limited: TeX could not read every file
            in this project.
          </span>
        )}
      </p>
      <ul
        aria-label={`Problems in ${path}`}
        className="min-h-0 flex-1 overflow-auto p-1"
      >
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
    </div>
  )
}
