import { useState } from "react"
import {
  AlertCircle,
  PackagePlus,
  ScrollText,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BuildDiagnostic, BuildRun } from "@/domain/build"
import type { ProjectRelativePath } from "@/domain/identifiers"
import type { ProjectError } from "@/domain/project"
import {
  hasUnmappedFailure,
  replaysCachedFailure,
} from "@/features/build/build-panel-model"
import {
  missingPackageFile,
  type PackageRecoveryController,
} from "@/features/build/use-package-recovery"
import { runDetached } from "@/lib/promises"

/**
 * One problem: the sentence naming it, where it is, and — on request — the
 * compiler's own line and the `l.NN` excerpt beneath it. The translation never
 * stands between a reader and what the engine actually said.
 */
function BuildProblem({
  active,
  diagnostic,
  onNavigate,
  onSelect,
  recovery,
}: {
  active: boolean
  diagnostic: BuildDiagnostic
  onNavigate: (path: ProjectRelativePath, line: number) => void
  onSelect: () => void
  recovery: PackageRecoveryController
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const { file, line, mappingUncertain } = diagnostic
  const locatable = file !== null && line !== null && !mappingUncertain
  // A translated sentence differs from the compiler's line; an untranslated one
  // repeats it, and showing the same text twice is noise, not evidence.
  const translated = diagnostic.message !== diagnostic.raw
  const evidence = translated || diagnostic.context !== null

  return (
    <li className="flex flex-col">
      <Button
        aria-current={active ? "true" : undefined}
        className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1 text-left font-normal"
        onClick={() => {
          onSelect()
          if (locatable) onNavigate(file, line)
        }}
        variant={active ? "secondary" : "ghost"}
      >
        {diagnostic.severity === "error" ? (
          <AlertCircle aria-hidden="true" className="text-destructive" />
        ) : (
          <TriangleAlert aria-hidden="true" className="text-muted-foreground" />
        )}
        <span className="sr-only">
          {diagnostic.severity === "error" ? "Error: " : "Warning: "}
        </span>
        <span className="min-w-0 flex-1 truncate">{diagnostic.message}</span>
        {diagnostic.occurrences > 1 ? (
          <Badge className="shrink-0" variant="secondary">
            {diagnostic.occurrences} passes
          </Badge>
        ) : null}
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {file === null
            ? "no location"
            : `${file}${line === null ? "" : `:${line}`}${mappingUncertain ? " · uncertain" : ""}`}
        </span>
      </Button>
      {missingPackageFile(diagnostic) === null ? null : (
        <PackageRecovery diagnostic={diagnostic} recovery={recovery} />
      )}
      {evidence ? (
        <div className="pl-8">
          <Button
            aria-expanded={evidenceOpen}
            className="h-6 px-2 text-xs font-normal text-muted-foreground"
            onClick={() => setEvidenceOpen((open) => !open)}
            size="sm"
            variant="ghost"
          >
            {evidenceOpen ? "Hide compiler output" : "Show compiler output"}
          </Button>
          {evidenceOpen ? (
            <pre className="mt-1 mb-1 overflow-x-auto rounded-sm bg-muted px-2 py-1 font-mono text-xs whitespace-pre-wrap">
              {diagnostic.context === null
                ? diagnostic.raw
                : `${diagnostic.raw}\n${diagnostic.context}`}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * The one action a missing package needs. `! LaTeX Error: File 'x.sty' not
 * found` is the most common LaTeX failure there is, and it was a dead end with
 * a red icon; every step from here names exactly what it will do.
 */
function PackageRecovery({
  diagnostic,
  recovery,
}: {
  diagnostic: BuildDiagnostic
  recovery: PackageRecoveryController
}) {
  const { state } = recovery
  const file = missingPackageFile(diagnostic)
  // The controller is shared, so only the row whose file is being handled
  // shows its progress; the rest keep offering the lookup.
  const owned =
    (state.status === "ready" ||
      state.status === "installing" ||
      state.status === "installed") &&
    state.candidate.file === file
  const unresolved = state.status === "unresolved" && state.file === file

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 pl-8">
      {owned && state.status !== "installed" ? (
        <>
          <span className="font-mono text-xs text-muted-foreground">
            {state.candidate.command}
          </span>
          <Button
            className="h-6 px-2 text-xs"
            disabled={state.status === "installing"}
            onClick={() => runDetached(recovery.install())}
            size="sm"
            variant="secondary"
          >
            <PackagePlus aria-hidden="true" data-icon="inline-start" />
            {state.status === "installing"
              ? `Installing ${state.candidate.package}…`
              : `Install ${state.candidate.package}`}
          </Button>
        </>
      ) : owned ? (
        <span className="text-xs text-muted-foreground">
          {state.candidate.package} is installed. Build again to use it.
        </span>
      ) : unresolved ? (
        <span className="text-xs text-muted-foreground">
          No package in this distribution provides {state.file}.
        </span>
      ) : (
        <Button
          className="h-6 px-2 text-xs font-normal text-muted-foreground"
          disabled={state.status === "resolving"}
          onClick={() => runDetached(recovery.resolve(diagnostic))}
          size="sm"
          variant="ghost"
        >
          {state.status === "resolving"
            ? "Looking up the package…"
            : "Find the package that provides this"}
        </Button>
      )}
      {state.status === "error" ? (
        <span className="text-xs text-destructive">{state.message}</span>
      ) : null}
    </div>
  )
}

function BuildIssue({ error }: { error: ProjectError }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Build system issue</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  )
}

/**
 * The build half of the Problems surface: what the last run reported, plus the
 * build-system faults that stop a run from happening at all. It renders inside
 * the shared panel rather than owning one, so a reader has a single place to
 * look for everything wrong with the project.
 */
export function BuildProblemsSection({
  activeIndex,
  issue,
  onClean,
  onNavigate,
  onSelect,
  onShowOutput,
  recovery,
  run,
}: {
  activeIndex: number | null
  issue: ProjectError | null
  onClean: () => void
  onNavigate: (path: ProjectRelativePath, line: number) => void
  onSelect: (index: number) => void
  onShowOutput: () => void
  recovery: PackageRecoveryController
  run: BuildRun | null
}) {
  const unmappedFailure = hasUnmappedFailure(run)
  const cachedFailure = replaysCachedFailure(run)
  if (
    (run === null || run.diagnostics.length === 0) &&
    issue === null &&
    !unmappedFailure
  ) {
    return (
      <p className="px-3 py-2 text-ui text-muted-foreground">
        {run === null
          ? "No build yet. Errors and warnings from the compiler appear here."
          : "The last build reported nothing."}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 p-2">
      {issue !== null ? <BuildIssue error={issue} /> : null}
      {cachedFailure ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>latexmk replayed an earlier failure</AlertTitle>
          <AlertDescription>
            <p>
              Your sources have not changed since a build failed, so latexmk
              reported the stored result instead of compiling again. The
              original error is in that earlier run&apos;s log. Remove the
              generated files to force a full rebuild.
            </p>
            <Button className="mt-2" onClick={onClean} size="sm">
              <Trash2 aria-hidden="true" data-icon="inline-start" />
              Clean auxiliary files
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {unmappedFailure && !cachedFailure ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Build failed</AlertTitle>
          <AlertDescription>
            <p>The compiler did not report a source location.</p>
            <Button className="mt-2" onClick={onShowOutput} size="sm">
              <ScrollText aria-hidden="true" data-icon="inline-start" />
              Show the complete log
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {run !== null && run.diagnostics.length > 0 ? (
        <ul className="flex flex-col" aria-label="Build diagnostics">
          {run.diagnostics.map((diagnostic, index) => (
            <BuildProblem
              active={activeIndex === index}
              diagnostic={diagnostic}
              key={`${diagnostic.code}-${diagnostic.file ?? ""}-${diagnostic.line ?? 0}-${diagnostic.message}`}
              onNavigate={onNavigate}
              onSelect={() => onSelect(index)}
              recovery={recovery}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
