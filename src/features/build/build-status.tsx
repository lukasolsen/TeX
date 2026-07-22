import {
  AlertCircle,
  Circle,
  CircleSlash,
  CheckCircle2,
  Loader2,
} from "lucide-react"

import type { BuildRun, ProjectBuildState } from "@/domain/build"
import type { ProjectError } from "@/domain/project"
import {
  diagnosticSummary,
  statusLabel,
  watchLabel,
} from "@/features/build/build-panel-model"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import { formatClockTime } from "@/lib/format"

/**
 * Single source of build truth in the panel chrome: one icon, one state word,
 * and the detail that changes what the user does next. Severity is carried by
 * the icon and the wording, never by colour alone.
 */
export function BuildStatus({
  issue,
  run,
  state,
  watch,
}: {
  issue: ProjectError | null
  run: BuildRun | null
  state: ProjectBuildState
  watch: ProjectWatchState
}) {
  const blocked =
    run === null && issue === null && state.preview.status === "unavailable"
  const details: string[] = []
  if (blocked && state.preview.status === "unavailable")
    details.push(state.preview.reason)
  if (issue !== null && run === null) details.push(issue.message)
  if (run !== null && run.status !== "running") {
    details.push(diagnosticSummary(run))
    if (run.finishedAt !== null) details.push(formatClockTime(run.finishedAt))
    if (run.exitCode !== null && run.exitCode !== 0)
      details.push(`exit ${run.exitCode}`)
  }
  const watchDetail = watchLabel(watch)
  if (watchDetail !== null) details.push(watchDetail)

  return (
    <p className="flex min-w-0 items-center gap-2 text-xs">
      <span
        className={
          run?.status === "failed" || issue !== null
            ? "flex shrink-0 items-center gap-1.5 font-medium text-destructive"
            : "flex shrink-0 items-center gap-1.5 font-medium"
        }
      >
        <StatusIcon issue={issue} run={run} />
        {issue !== null && run === null
          ? "Unavailable"
          : blocked
            ? "Not ready"
            : run === null
              ? "Ready"
              : statusLabel(run.status)}
      </span>
      {details.length > 0 ? (
        <span className="truncate text-muted-foreground">
          {details.join(" · ")}
        </span>
      ) : null}
    </p>
  )
}

function StatusIcon({
  issue,
  run,
}: {
  issue: ProjectError | null
  run: BuildRun | null
}) {
  if (run?.status === "running")
    return (
      <Loader2
        aria-hidden="true"
        className="size-3.5 animate-spin motion-reduce:animate-none"
      />
    )
  if (run?.status === "failed" || (run === null && issue !== null))
    return <AlertCircle aria-hidden="true" className="size-3.5" />
  if (run?.status === "succeeded")
    return <CheckCircle2 aria-hidden="true" className="size-3.5" />
  if (run?.status === "cancelled")
    return (
      <CircleSlash
        aria-hidden="true"
        className="size-3.5 text-muted-foreground"
      />
    )
  return (
    <Circle aria-hidden="true" className="size-3.5 text-muted-foreground" />
  )
}
