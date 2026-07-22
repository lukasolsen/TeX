import type { BuildRun } from "@/domain/build"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import { formatClockTime } from "@/lib/format"

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
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
  }
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

export function diagnosticSummary(run: BuildRun): string {
  const errors = run.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  const warnings = run.diagnostics.length - errors
  return `${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}`
}
