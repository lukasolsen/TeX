import { useEffect, useState } from "react"
import {
  AlertCircle,
  Circle,
  CircleSlash,
  CheckCircle2,
  Loader2,
  TriangleAlert,
} from "lucide-react"

import type { BuildRun, ProjectBuildState } from "@/domain/build"
import type { ProjectError } from "@/domain/project"
import {
  diagnosticSummary,
  elapsedLabel,
  isFailedStatus,
  progressLabel,
  statusLabel,
  watchLabel,
} from "@/features/build/build-panel-model"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import { formatClockTime } from "@/lib/format"

/**
 * Ticks once a second while a build runs, so the elapsed time advances without
 * every log batch forcing a re-render of the whole panel.
 */
function useElapsedClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [running])
  return now
}

/**
 * Single source of build truth in the panel chrome: one icon, one state word,
 * and the detail that changes what the user does next. Severity is carried by
 * the icon and the wording, never by colour alone.
 */
export function BuildStatus({
  issue,
  queued,
  run,
  state,
  watch,
}: {
  issue: ProjectError | null
  queued: boolean
  run: BuildRun | null
  state: ProjectBuildState
  watch: ProjectWatchState
}) {
  const now = useElapsedClock(run?.status === "running")
  const blocked =
    run === null && issue === null && state.preview.status === "unavailable"
  const details: string[] = []
  if (blocked && state.preview.status === "unavailable")
    details.push(state.preview.reason)
  if (issue !== null && run === null) details.push(issue.message)
  if (run !== null && run.status === "running") {
    // `ui-ux-requirements.md` forbids a spinner as the only evidence of work.
    const progress = progressLabel(run)
    if (progress !== null) details.push(progress)
    details.push(`${elapsedLabel(run, now)} elapsed`)
  }
  if (run !== null && run.status !== "running") {
    // The reason names the outcome; the counts quantify it. A status word on
    // its own is not an explanation.
    if (run.reason !== null) details.push(run.reason)
    details.push(diagnosticSummary(run), elapsedLabel(run, now))
    if (run.finishedAt !== null) details.push(formatClockTime(run.finishedAt))
  }
  // Pressing Build during a build is acknowledged here rather than refused.
  if (queued) details.push("another build queued")
  const watchDetail = watchLabel(watch)
  if (watchDetail !== null) details.push(watchDetail)

  return (
    <p className="flex min-w-0 items-center gap-2 text-xs">
      <span
        className={
          (run !== null && isFailedStatus(run.status)) || issue !== null
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
  if (
    (run !== null && isFailedStatus(run.status)) ||
    (run === null && issue !== null)
  )
    return <AlertCircle aria-hidden="true" className="size-3.5" />
  if (run?.status === "succeeded")
    return <CheckCircle2 aria-hidden="true" className="size-3.5" />
  // A run that produced a PDF and reported problems is not a failure; the
  // warning mark says "usable, with something to read" without the alarm.
  if (run?.status === "succeededWithProblems")
    return <TriangleAlert aria-hidden="true" className="size-3.5" />
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
