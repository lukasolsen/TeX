import type {
  BuildProfilesState,
  BuildRun,
  ProjectBuildState,
} from "@/domain/build"
import type { ProjectError } from "@/domain/project"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import { formatClockTime, formatElapsed } from "@/lib/format"

/**
 * The one build-system fault worth reporting, in the order that decides what
 * the user does next: a rejected action, then an unusable invocation, then a
 * distribution that could not be inspected.
 */
export function buildIssue(
  state: ProjectBuildState,
  profiles: BuildProfilesState
): ProjectError | null {
  if (state.action.status === "error") return state.action.error
  if (state.preview.status === "error") return state.preview.error
  if (profiles.status === "error") return profiles.error
  return null
}

/**
 * A failed run the log could not attribute to a source line. It still belongs
 * in Problems — a failure with nothing listed under it reads as a lost report.
 */
export function hasUnmappedFailure(run: BuildRun | null): boolean {
  return run?.status === "failed" && run.diagnostics.length === 0
}

/**
 * Everything the Problems surface will show for the build: each diagnostic, an
 * unavailable build system, and an unattributed failure. The count is shared by
 * the dock tab badge and the status bar so they can never disagree.
 */
export function buildProblemCount(
  run: BuildRun | null,
  issue: ProjectError | null
): number {
  return (
    (run?.diagnostics.length ?? 0) +
    (issue === null ? 0 : 1) +
    (hasUnmappedFailure(run) ? 1 : 0)
  )
}

/** The subset of `buildProblemCount` that stops the project from building. */
export function buildErrorCount(
  run: BuildRun | null,
  issue: ProjectError | null
): number {
  const errors = (run?.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  return errors + (issue === null ? 0 : 1) + (hasUnmappedFailure(run) ? 1 : 0)
}

/**
 * latexmk keeps a database of the previous run. When nothing has changed since
 * a failure it reports that stored error and compiles nothing, which reads like
 * an unexplained failure until the generated files are removed.
 */
export function replaysCachedFailure(run: BuildRun | null): boolean {
  return (
    run?.status === "failed" &&
    run.entries.some((entry) =>
      entry.text.includes("gave an error in previous invocation of latexmk")
    )
  )
}

export function statusLabel(status: BuildRun["status"]): string {
  switch (status) {
    case "running":
      return "Building"
    case "succeeded":
      return "Succeeded"
    case "succeededWithProblems":
      return "Built with problems"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Stopped"
    case "timedOut":
      return "Timed out"
  }
}

/**
 * Whether a status is a failure the panel should mark. A run that produced a
 * PDF and reported problems is not a failure, and colouring it as one teaches
 * people to distrust the signal.
 */
export function isFailedStatus(status: BuildRun["status"]): boolean {
  return status === "failed" || status === "timedOut"
}

export function watchLabel(state: ProjectWatchState): string | null {
  switch (state.status) {
    case "off":
      return null
    case "starting":
      return "watch starting"
    case "watching":
      // The Watch toggle already reads "Watching"; do not repeat it here.
      return null
    case "buildQueued":
      return "watch build queued"
    case "building":
      return "watch building"
    case "stopping":
      return "watch stopping"
    case "error":
      return "watch error"
    case "pausedUnsafe":
      return "watch paused"
  }
}

export function runLabel(run: BuildRun, index: number): string {
  const time = formatClockTime(run.startedAt)
  return index === 0
    ? `Latest · ${statusLabel(run.status)}`
    : `${time} · ${statusLabel(run.status)}`
}

/**
 * What a running build is doing, in the order a reader wants it: which pass,
 * running what, and how far it has got. Returns null before the engine has
 * said anything, so the panel shows the spinner alone only briefly.
 */
export function progressLabel(run: BuildRun): string | null {
  if (run.status !== "running") return null
  const parts: string[] = []
  if (run.progress.pass > 0) {
    parts.push(
      run.progress.tool === null
        ? `pass ${run.progress.pass}`
        : `pass ${run.progress.pass} · ${run.progress.tool}`
    )
  }
  if (run.progress.pages > 0) {
    parts.push(
      `${run.progress.pages} ${run.progress.pages === 1 ? "page" : "pages"}`
    )
  }
  return parts.length === 0 ? null : parts.join(" · ")
}

/** How long a finished run took, or how long the running one has been going. */
export function elapsedLabel(run: BuildRun, now: number): string {
  const end = run.finishedAt ?? now
  return formatElapsed(Math.max(end - run.startedAt, 0))
}

export function diagnosticSummary(run: BuildRun): string {
  const errors = run.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  const warnings = run.diagnostics.length - errors
  return `${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}`
}
