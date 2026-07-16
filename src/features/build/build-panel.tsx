import { useEffect, useRef } from "react"
import type { Dispatch } from "react"
import {
  AlertCircle,
  CheckCircle2,
  CircleStop,
  Hammer,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  formatBuildInvocation,
  selectedBuildRun,
  type BuildEngine,
  type BuildProfile,
  type BuildProfilesState,
  type BuildRun,
  type ProjectBuildAction,
  type ProjectBuildState,
} from "@/domain/build"
import type { ProjectError } from "@/domain/project"

export function BuildPanel({
  dispatch,
  engine,
  onBuild,
  onClose,
  onNavigate,
  onStop,
  profiles,
  setEngine,
  state,
}: {
  dispatch: Dispatch<ProjectBuildAction>
  engine: BuildEngine
  onBuild: () => void
  onClose: () => void
  onNavigate: (path: string, line: number) => void
  onStop: () => void
  profiles: BuildProfilesState
  setEngine: (engine: BuildEngine) => void
  state: ProjectBuildState
}) {
  const run = selectedBuildRun(state)
  const running = state.runs.some((item) => item.status === "running")
  const pending = state.action.status === "pending"
  const profileAvailable =
    profiles.status === "ready" &&
    profiles.profiles.some(
      (profile) => profile.engine === engine && profile.available
    )
  const canBuild =
    state.preview.status === "ready" && profileAvailable && !running && !pending
  const issue =
    state.action.status === "error"
      ? state.action.error
      : state.preview.status === "error"
        ? state.preview.error
        : profiles.status === "error"
          ? profiles.error
          : null
  const unmappedFailure =
    run?.status === "failed" && run.diagnostics.length === 0
  const problemCount =
    (run?.diagnostics.length ?? 0) +
    (issue === null ? 0 : 1) +
    (unmappedFailure ? 1 : 0)

  return (
    <section
      aria-label="Build"
      className="flex size-full min-h-0 flex-col bg-workspace-chrome"
    >
      <header className="flex min-w-0 items-center gap-2 border-b px-3 py-1.5">
        <Terminal aria-hidden="true" className="size-4 shrink-0" />
        <h2 className="hidden text-xs font-semibold tracking-wide uppercase sm:block">
          Build
        </h2>
        <BuildStatusBadge run={run} />
        {run !== null ? (
          <span className="hidden text-xs text-muted-foreground lg:inline">
            {diagnosticSummary(run)}
          </span>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <BuildProfileSelect
            disabled={running || pending}
            engine={engine}
            profiles={profiles}
            setEngine={setEngine}
          />
          {running ? (
            <Button
              disabled={pending}
              onClick={onStop}
              size="sm"
              variant="outline"
            >
              <CircleStop data-icon="inline-start" />
              Stop
            </Button>
          ) : (
            <Button
              aria-label="Build PDF"
              disabled={!canBuild}
              onClick={onBuild}
              size="sm"
            >
              <Hammer data-icon="inline-start" />
              <span className="hidden sm:inline">Build PDF</span>
            </Button>
          )}
          <Button
            aria-label="Close build panel"
            onClick={onClose}
            size="icon-sm"
            title="Close build panel"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
        <BuildCommand state={state} />
        <SelectedRunMetadata run={run} />
        {issue !== null ? <BuildIssue error={issue} /> : null}
        <Tabs className="min-h-0 flex-1 gap-1" defaultValue="output">
          <div className="flex min-w-0 items-center">
            <TabsList variant="line">
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="problems">
                Problems{problemCount === 0 ? "" : ` (${problemCount})`}
              </TabsTrigger>
            </TabsList>
            {state.runs.length > 0 ? (
              <Select
                aria-label="Build run"
                onValueChange={(runId) => {
                  if (runId !== null) dispatch({ type: "selectRun", runId })
                }}
                value={state.selectedRunId ?? undefined}
              >
                <SelectTrigger className="ml-auto w-44" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="min-w-44">
                  <SelectGroup>
                    {state.runs.map((item, index) => (
                      <SelectItem key={item.id} value={item.id}>
                        {index === 0
                          ? "Latest"
                          : `Run ${state.runs.length - index}`}{" "}
                        · {statusLabel(item.status)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <TabsContent className="min-h-0" value="output">
            <BuildOutput run={run} />
          </TabsContent>
          <TabsContent className="min-h-0" value="problems">
            <BuildProblems issue={issue} onNavigate={onNavigate} run={run} />
          </TabsContent>
        </Tabs>
      </div>
      <p className="sr-only" aria-live="polite">
        {run === null
          ? ""
          : run.status === "running"
            ? "Build started."
            : `Build ${statusLabel(run.status)}. ${diagnosticSummary(run)}.`}
      </p>
    </section>
  )
}

function BuildProfileSelect({
  disabled,
  engine,
  profiles,
  setEngine,
}: {
  disabled: boolean
  engine: BuildEngine
  profiles: BuildProfilesState
  setEngine: (engine: BuildEngine) => void
}) {
  const current =
    profiles.status === "ready"
      ? (profiles.profiles.find((profile) => profile.engine === engine) ?? null)
      : null
  return (
    <Select
      aria-label="Build profile"
      disabled={disabled || profiles.status !== "ready"}
      onValueChange={(value) => {
        if (isBuildEngine(value)) setEngine(value)
      }}
      value={engine}
    >
      <SelectTrigger className="w-48" size="sm" title={current?.description}>
        <SelectValue>
          {profiles.status === "loading"
            ? "Detecting tools…"
            : profiles.status === "error"
              ? "Profiles unavailable"
              : (current?.label ?? "Choose profile")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="min-w-72">
        <SelectGroup>
          <SelectLabel>Build profiles</SelectLabel>
          {profiles.status === "ready"
            ? profiles.profiles.map((profile) => (
                <BuildProfileItem key={profile.engine} profile={profile} />
              ))
            : null}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function BuildProfileItem({ profile }: { profile: BuildProfile }) {
  return (
    <SelectItem
      aria-label={`${profile.label}. ${profile.description}${profile.available ? "" : " Unavailable because the executable was not found."}`}
      disabled={!profile.available}
      title={profile.description}
      value={profile.engine}
    >
      {profile.label}
      {profile.available ? (
        <Badge variant={profile.recommended ? "secondary" : "outline"}>
          {profile.recommended ? "Recommended" : "Single pass"}
        </Badge>
      ) : (
        <Badge variant="destructive">Unavailable</Badge>
      )}
    </SelectItem>
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

function SelectedRunMetadata({ run }: { run: BuildRun | null }) {
  if (run === null) return null
  return (
    <p className="truncate pb-1 text-xs text-muted-foreground">
      Selected run started {formatRunTime(run.startedAt)}
      {run.finishedAt === null
        ? ""
        : ` · finished ${formatRunTime(run.finishedAt)}`}{" "}
      · exit {run.exitCode ?? "—"}
    </p>
  )
}

function BuildCommand({ state }: { state: ProjectBuildState }) {
  if (state.preview.status === "loading") {
    return (
      <p className="truncate pb-1 text-xs text-muted-foreground">
        Preparing command…
      </p>
    )
  }
  if (state.preview.status === "unavailable") {
    return (
      <p className="truncate pb-1 text-xs text-muted-foreground">
        {state.preview.reason}
      </p>
    )
  }
  if (state.preview.status === "error") {
    return (
      <p className="truncate pb-1 text-xs text-destructive">
        {state.preview.error.message}
      </p>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5 pb-1 text-xs">
      <p
        className="flex min-w-0 gap-2"
        title={formatBuildInvocation(state.preview.invocation)}
      >
        <span className="shrink-0 text-muted-foreground">Command</span>
        <code className="truncate font-mono">
          {formatBuildInvocation(state.preview.invocation)}
        </code>
      </p>
      <p className="flex min-w-0 gap-2 text-muted-foreground">
        <span className="shrink-0">Working directory</span>
        <span className="truncate">
          {state.preview.invocation.workingDirectory}
        </span>
        <span className="shrink-0">
          Root {state.preview.invocation.rootFile}
        </span>
      </p>
    </div>
  )
}

function BuildStatusBadge({ run }: { run: BuildRun | null }) {
  if (run === null) return <Badge variant="outline">Ready</Badge>
  const variant =
    run.status === "failed"
      ? "destructive"
      : run.status === "succeeded"
        ? "secondary"
        : "outline"
  return <Badge variant={variant}>{statusLabel(run.status)}</Badge>
}

function BuildOutput({ run }: { run: BuildRun | null }) {
  const scrollRoot = useRef<HTMLDivElement>(null)
  const followOutput = useRef(true)

  useEffect(() => {
    const viewport = scrollRoot.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    )
    if (viewport === undefined || viewport === null) return
    const trackPosition = () => {
      followOutput.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32
    }
    viewport.addEventListener("scroll", trackPosition, { passive: true })
    return () => viewport.removeEventListener("scroll", trackPosition)
  }, [run?.id])

  useEffect(() => {
    const viewport = scrollRoot.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    )
    if (viewport !== undefined && viewport !== null && followOutput.current) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [run?.entries.length, run?.id])

  if (run === null) {
    return (
      <BuildEmpty
        description="The exact command is shown above. Start a build to capture stdout and stderr here."
        title="No build output yet"
      />
    )
  }
  return (
    <ScrollArea className="h-full" ref={scrollRoot}>
      <ol
        className="min-h-full bg-source px-3 py-2 font-mono text-xs leading-5"
        aria-label="Raw build output"
      >
        {run.entries.length === 0 ? (
          <li className="text-muted-foreground">
            Waiting for compiler output…
          </li>
        ) : null}
        {run.entries.map((entry) => (
          <li className="text-source-foreground" key={entry.sequence}>
            <span
              className="mr-3 inline-block w-8 text-right text-muted-foreground select-none"
              aria-hidden="true"
            >
              {entry.sequence}
            </span>
            <span className="mr-2 text-muted-foreground">[{entry.stream}]</span>
            <span className="break-words whitespace-pre-wrap">
              {entry.text || " "}
            </span>
          </li>
        ))}
      </ol>
    </ScrollArea>
  )
}

function BuildProblems({
  issue,
  onNavigate,
  run,
}: {
  issue: ProjectError | null
  onNavigate: (path: string, line: number) => void
  run: BuildRun | null
}) {
  const unmappedFailure =
    run?.status === "failed" && run.diagnostics.length === 0
  if (
    (run === null || run.diagnostics.length === 0) &&
    issue === null &&
    !unmappedFailure
  ) {
    return (
      <BuildEmpty
        description="Compiler diagnostics with reliable source locations will appear here. Raw output is always retained."
        title="No diagnostics"
      />
    )
  }
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 py-1">
        {issue !== null ? <BuildIssue error={issue} /> : null}
        {unmappedFailure ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Build failed</AlertTitle>
            <AlertDescription>
              The compiler did not provide a reliable source location. Review
              the Output tab for the complete log.
            </AlertDescription>
          </Alert>
        ) : null}
        <ul className="flex flex-col gap-1" aria-label="Build diagnostics">
          {(run?.diagnostics ?? []).map((diagnostic) => {
            const locationAvailable =
              diagnostic.file !== null &&
              diagnostic.line !== null &&
              !diagnostic.mappingUncertain
            return (
              <li key={`${diagnostic.logSequence}-${diagnostic.message}`}>
                <Button
                  className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-left"
                  disabled={!locationAvailable}
                  onClick={() => {
                    if (
                      locationAvailable &&
                      diagnostic.file !== null &&
                      diagnostic.line !== null
                    ) {
                      onNavigate(diagnostic.file, diagnostic.line)
                    }
                  }}
                  variant="ghost"
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
                  <span className="min-w-0">
                    <span className="block truncate">{diagnostic.message}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {diagnostic.file === null
                        ? "Source location unavailable"
                        : `${diagnostic.file}${diagnostic.line === null ? "" : `:${diagnostic.line}`}${diagnostic.mappingUncertain ? " · location uncertain" : ""}`}
                    </span>
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

function BuildEmpty({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <Empty className="h-full p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CheckCircle2 aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        <EmptyDescription className="text-xs">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function statusLabel(status: BuildRun["status"]): string {
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

function diagnosticSummary(run: BuildRun): string {
  const errors = run.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  const warnings = run.diagnostics.length - errors
  return `${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}`
}

function formatRunTime(timestamp: number): string {
  return new Date(timestamp * 1_000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function isBuildEngine(value: unknown): value is BuildEngine {
  return (
    value === "latexmkPdf" ||
    value === "pdfLatex" ||
    value === "xeLatex" ||
    value === "luaLatex"
  )
}
