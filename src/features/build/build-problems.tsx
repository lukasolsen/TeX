import { AlertCircle, Trash2, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BuildRun } from "@/domain/build"
import type { ProjectRelativePath } from "@/domain/identifiers"
import type { ProjectError } from "@/domain/project"
import { replaysCachedFailure } from "@/features/build/build-panel-model"
import { PanelPlaceholder } from "@/features/build/panel-placeholder"

function BuildIssue({ error }: { error: ProjectError }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Build system issue</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  )
}

export function BuildProblems({
  activeIndex,
  issue,
  onClean,
  onNavigate,
  onSelect,
  run,
}: {
  activeIndex: number | null
  issue: ProjectError | null
  onClean: () => void
  onNavigate: (path: ProjectRelativePath, line: number) => void
  onSelect: (index: number) => void
  run: BuildRun | null
}) {
  const unmappedFailure =
    run?.status === "failed" && run.diagnostics.length === 0
  const cachedFailure = replaysCachedFailure(run)
  if (
    (run === null || run.diagnostics.length === 0) &&
    issue === null &&
    !unmappedFailure
  ) {
    return (
      <PanelPlaceholder>
        No diagnostics. Errors and warnings with a source location appear here.
      </PanelPlaceholder>
    )
  }
  return (
    <ScrollArea className="h-full">
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
              The compiler did not report a source location. Open Output for the
              complete log.
            </AlertDescription>
          </Alert>
        ) : null}
        <ul className="flex flex-col" aria-label="Build diagnostics">
          {(run?.diagnostics ?? []).map((diagnostic, index) => {
            const locationAvailable =
              diagnostic.file !== null &&
              diagnostic.line !== null &&
              !diagnostic.mappingUncertain
            return (
              <li key={`${diagnostic.logSequence}-${diagnostic.message}`}>
                <Button
                  aria-current={activeIndex === index ? "true" : undefined}
                  className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1 text-left font-normal"
                  onClick={() => {
                    onSelect(index)
                    if (
                      locationAvailable &&
                      diagnostic.file !== null &&
                      diagnostic.line !== null
                    ) {
                      onNavigate(diagnostic.file, diagnostic.line)
                    }
                  }}
                  variant={activeIndex === index ? "secondary" : "ghost"}
                >
                  {diagnostic.severity === "error" ? (
                    <AlertCircle
                      aria-hidden="true"
                      className="text-destructive"
                    />
                  ) : (
                    <TriangleAlert
                      aria-hidden="true"
                      className="text-muted-foreground"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {diagnostic.message}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {diagnostic.file === null
                      ? "no location"
                      : `${diagnostic.file}${diagnostic.line === null ? "" : `:${diagnostic.line}`}${diagnostic.mappingUncertain ? " · uncertain" : ""}`}
                  </span>
                </Button>
              </li>
            )
          })}
        </ul>
      </div>
    </ScrollArea>
  )
}
