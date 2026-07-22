import { useEffect, useRef, useState } from "react"
import type { Dispatch, ReactElement, ReactNode } from "react"
import {
  AlertCircle,
  ChevronRight,
  Circle,
  CircleSlash,
  CircleStop,
  CheckCircle2,
  Download,
  Hammer,
  Loader2,
  Eye,
  Settings2,
  FolderOpen,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
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
  type ProjectBuildConfiguration,
  type ProjectBuildConfigurationState,
} from "@/domain/build"
import type { ProjectError } from "@/domain/project"
import type { BuildPanelTab } from "@/domain/project"
import type { ProjectRelativePath } from "@/domain/identifiers"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import { BuildConfigurationDialog } from "@/features/build/build-configuration-dialog"
import { LatexInstallDialog } from "@/features/build/latex-install-dialog"
import { LatexInstallToast } from "@/features/build/latex-install-toast"
import { useLatexInstall } from "@/features/build/use-latex-install"
import type { LatexInstallController } from "@/features/build/use-latex-install"
import { installStepSummary } from "@/domain/latex-install"

export function BuildPanel({
  dispatch,
  activeDiagnosticIndex,
  logContextSequence,
  configurationState,
  engine,
  onBuild,
  onNavigate,
  onSelectDiagnostic,
  onStop,
  onStartWatch,
  onStopWatch,
  onSaveConfiguration,
  onClean,
  onLatexInstalled,
  onRevealOutput,
  onTabChange,
  profiles,
  setEngine,
  state,
  tab,
  watch,
}: {
  dispatch: Dispatch<ProjectBuildAction>
  activeDiagnosticIndex: number | null
  logContextSequence: number | null
  configurationState: ProjectBuildConfigurationState
  engine: BuildEngine
  onBuild: () => void
  onNavigate: (path: ProjectRelativePath, line: number) => void
  onSelectDiagnostic: (index: number) => void
  onStop: () => void
  onStartWatch: () => void
  onStopWatch: () => void
  onSaveConfiguration: (
    configuration: ProjectBuildConfiguration
  ) => Promise<void>
  onClean: () => void
  onLatexInstalled: () => void
  onRevealOutput: () => void
  onTabChange: (tab: BuildPanelTab) => void
  profiles: BuildProfilesState
  setEngine: (engine: BuildEngine) => void
  state: ProjectBuildState
  tab: BuildPanelTab
  watch: ProjectWatchState
}): ReactElement {
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const install = useLatexInstall({ onInstalled: onLatexInstalled })
  const run = selectedBuildRun(state)
  const running = state.runs.some((item) => item.status === "running")
  const pending = state.action.status === "pending"
  const selectedProfile =
    profiles.status === "ready"
      ? (profiles.profiles.find((profile) => profile.engine === engine) ?? null)
      : null
  const profileAvailable = selectedProfile?.available ?? false
  const missingProfile =
    selectedProfile !== null && !selectedProfile.available
      ? selectedProfile
      : null
  // A distribution can install without the recommended engine. Offering the
  // engines that did arrive beats leaving the user at a dead end.
  const installedAlternative =
    missingProfile === null || profiles.status !== "ready"
      ? null
      : (profiles.profiles.find(
          (profile) => profile.engine !== engine && profile.available
        ) ?? null)
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
  const watchActive = watch.status !== "off" && watch.status !== "error"

  return (
    <section
      aria-label="Build"
      className="relative flex size-full min-h-0 flex-col bg-workspace-chrome"
    >
      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={(value) => {
          if (value === "output" || value === "problems") onTabChange(value)
        }}
        value={tab}
      >
        <div className="flex h-9 min-w-0 shrink-0 items-center gap-3 border-b px-2">
          <TabsList className="h-full shrink-0" variant="line">
            <TabsTrigger className="px-2 text-xs" value="output">
              Output
            </TabsTrigger>
            <TabsTrigger className="px-2 text-xs" value="problems">
              Problems
              {problemCount === 0 ? null : (
                <Badge className="h-4 px-1.5 text-[10px]" variant="secondary">
                  {problemCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <BuildStatus issue={issue} run={run} state={state} watch={watch} />
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {state.runs.length > 1 ? (
              <Select
                aria-label="Build run"
                onValueChange={(runId) => {
                  if (runId !== null) dispatch({ type: "selectRun", runId })
                }}
                value={state.selectedRunId ?? undefined}
              >
                <SelectTrigger
                  aria-label="Build run"
                  className="mr-1 w-36"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="min-w-44">
                  <SelectGroup>
                    {state.runs.map((item, index) => (
                      <SelectItem key={item.id} value={item.id}>
                        {runLabel(item, index)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
            <Button
              aria-label="Clean auxiliary files"
              disabled={running}
              onClick={onClean}
              size="icon-sm"
              title="Preview and clean auxiliary files"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
            <Button
              aria-label="Reveal built PDF"
              onClick={onRevealOutput}
              size="icon-sm"
              title="Reveal built PDF in the file manager"
              variant="ghost"
            >
              <FolderOpen aria-hidden="true" />
            </Button>
            <Button
              aria-label="Configure project build"
              disabled={configurationState.status !== "ready"}
              onClick={() => setConfigurationOpen(true)}
              size="icon-sm"
              title={
                configurationState.status === "error"
                  ? configurationState.error.message
                  : "Configure project build"
              }
              variant="ghost"
            >
              <Settings2 aria-hidden="true" />
            </Button>
            <Separator className="mx-1.5 h-4" orientation="vertical" />
            <Button
              aria-label="Rebuild on save"
              aria-pressed={watchActive}
              className="mr-1"
              disabled={
                watch.status === "starting" || watch.status === "stopping"
              }
              onClick={watchActive ? onStopWatch : onStartWatch}
              size="sm"
              title={
                watch.message ??
                (watchActive
                  ? "Stop rebuilding on save"
                  : "Rebuild automatically when sources are saved")
              }
              variant={watchActive ? "outline" : "ghost"}
            >
              <Eye data-icon="inline-start" />
              {watchActive ? "Watching" : "Watch"}
            </Button>
            <BuildProfileSelect
              disabled={running || pending}
              engine={engine}
              profiles={profiles}
              setEngine={setEngine}
            />
            {running ? (
              <Button
                className="ml-1"
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
                className="ml-1"
                disabled={!canBuild}
                onClick={onBuild}
                size="sm"
              >
                <Hammer data-icon="inline-start" />
                <span className="hidden sm:inline">Build PDF</span>
              </Button>
            )}
          </div>
        </div>
        {missingProfile !== null || install.running ? (
          <LatexToolBanner
            alternative={installedAlternative}
            install={install}
            onOpenInstaller={() => setInstallOpen(true)}
            onUseAlternative={setEngine}
            profile={missingProfile}
          />
        ) : null}
        <TabsContent className="min-h-0" value="output">
          <BuildOutput
            contextSequence={logContextSequence}
            run={run}
            state={state}
          />
        </TabsContent>
        <TabsContent className="min-h-0" value="problems">
          <BuildProblems
            activeIndex={activeDiagnosticIndex}
            issue={issue}
            onClean={onClean}
            onNavigate={onNavigate}
            onSelect={onSelectDiagnostic}
            run={run}
          />
        </TabsContent>
      </Tabs>

      <p className="sr-only" aria-live="polite">
        {run === null
          ? ""
          : run.status === "running"
            ? "Build started."
            : `Build ${statusLabel(run.status)}. ${diagnosticSummary(run)}.`}
      </p>
      {watch.message !== null ? (
        <p className="sr-only" aria-live="polite">
          {watch.message}
        </p>
      ) : null}
      {install.notice !== null && !installOpen ? (
        <LatexInstallToast
          notice={install.notice}
          onDismiss={install.acknowledgeNotice}
          onOpenDetails={() => {
            install.acknowledgeNotice()
            setInstallOpen(true)
          }}
        />
      ) : null}
      {installOpen ? (
        <LatexInstallDialog
          controller={install}
          onOpenChange={setInstallOpen}
          open
        />
      ) : null}
      {configurationOpen && configurationState.status === "ready" ? (
        <BuildConfigurationDialog
          configuration={configurationState.configuration}
          onOpenChange={setConfigurationOpen}
          onSave={onSaveConfiguration}
          open
        />
      ) : null}
    </section>
  )
}

/**
 * States the missing build tool where the Build tab already looks, and offers
 * the one action that resolves it. While an installation runs the same row
 * reports its real step, so closing the dialog never hides live work.
 */
function LatexToolBanner({
  alternative,
  install,
  onOpenInstaller,
  onUseAlternative,
  profile,
}: {
  alternative: BuildProfile | null
  install: LatexInstallController
  onOpenInstaller: () => void
  onUseAlternative: (engine: BuildEngine) => void
  profile: BuildProfile | null
}) {
  const { progress, running } = install
  const activeStep =
    progress === null
      ? null
      : (progress.steps[progress.activeStep ?? 0] ?? null)
  const detail =
    running && progress !== null
      ? `${installStepSummary(progress)} · ${activeStep?.detail ?? activeStep?.title ?? "Working"}`
      : alternative === null
        ? `TeX could not find ${profile?.executable ?? "the build tool"} on this computer. Install it to build this project.`
        : `TeX could not find ${profile?.executable ?? "the build tool"}, but ${alternative.label} is installed and can build this project.`

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-3 border-b bg-card px-3 py-2">
      {running ? (
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
        />
      ) : (
        <AlertCircle
          aria-hidden="true"
          className="size-4 shrink-0 text-destructive"
        />
      )}
      <p className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-medium">
          {running
            ? "Installing LaTeX"
            : `${profile?.label ?? "The selected build tool"} is not installed`}
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </p>
      {running || alternative === null ? null : (
        <Button
          className="shrink-0"
          onClick={() => onUseAlternative(alternative.engine)}
          size="sm"
          variant="outline"
        >
          Use {alternative.label}
        </Button>
      )}
      <Button
        className="shrink-0"
        onClick={onOpenInstaller}
        size="sm"
        variant={running ? "outline" : "default"}
      >
        {running ? null : (
          <Download aria-hidden="true" data-icon="inline-start" />
        )}
        {running ? "Installation details" : "Install LaTeX…"}
      </Button>
    </div>
  )
}

/**
 * Single source of build truth in the panel chrome: one icon, one state word,
 * and the detail that changes what the user does next. Severity is carried by
 * the icon and the wording, never by colour alone.
 */
function BuildStatus({
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
    if (run.finishedAt !== null) details.push(formatRunTime(run.finishedAt))
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
      <SelectTrigger
        aria-label="Build profile"
        className="w-40"
        size="sm"
        title={current?.description}
      >
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
      {!profile.available ? (
        <Badge variant="destructive">Not installed</Badge>
      ) : profile.recommended ? (
        <Badge variant="secondary">Recommended</Badge>
      ) : null}
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

/**
 * Shows the exact command that produced (or will produce) the log directly
 * above it, the way a terminal echoes an invocation, instead of a separate
 * always-on metadata block.
 */
function BuildCommandLine({ state }: { state: ProjectBuildState }) {
  // Unavailable and errored previews are already stated in the panel status,
  // so echoing them here would only repeat the same sentence twice.
  if (
    state.preview.status === "unavailable" ||
    state.preview.status === "error"
  )
    return null
  const content =
    state.preview.status === "loading"
      ? "Preparing command…"
      : formatBuildInvocation(state.preview.invocation)
  const title =
    state.preview.status === "ready"
      ? `${content}\nWorking directory: ${state.preview.invocation.workingDirectory}\nRoot file: ${state.preview.invocation.rootFile}`
      : content
  return (
    <p
      className="flex min-w-0 shrink-0 items-center gap-1 border-b px-3 py-1 font-mono text-xs text-muted-foreground"
      title={title}
    >
      <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{content}</span>
    </p>
  )
}

function BuildOutput({
  contextSequence,
  run,
  state,
}: {
  contextSequence: number | null
  run: BuildRun | null
  state: ProjectBuildState
}) {
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

  useEffect(() => {
    if (contextSequence === null) return
    const entry = scrollRoot.current?.querySelector<HTMLElement>(
      `[data-log-sequence="${contextSequence}"]`
    )
    entry?.scrollIntoView({ block: "center" })
  }, [contextSequence, run?.id])

  return (
    <div className="flex size-full min-h-0 flex-col bg-source">
      <BuildCommandLine state={state} />
      {run === null ? (
        <PanelPlaceholder>
          No output yet. Build the project to capture the compiler log here.
        </PanelPlaceholder>
      ) : (
        <ScrollArea className="min-h-0 flex-1" ref={scrollRoot}>
          <ol
            className="min-h-full py-1.5 font-mono text-xs leading-5"
            aria-label="Raw build output"
          >
            {run.entries.length === 0 ? (
              <li className="px-3 text-muted-foreground">
                Waiting for compiler output…
              </li>
            ) : null}
            {run.entries.map((entry) => (
              <li
                className={
                  entry.sequence === contextSequence
                    ? "flex bg-accent px-3 text-accent-foreground"
                    : entry.stream === "stderr"
                      ? "flex px-3 text-destructive"
                      : "flex px-3 text-source-foreground"
                }
                data-log-sequence={entry.sequence}
                key={entry.sequence}
              >
                <span
                  className="mr-3 w-8 shrink-0 text-right text-muted-foreground/60 select-none"
                  aria-hidden="true"
                >
                  {entry.sequence}
                </span>
                {entry.stream === "stderr" ? (
                  <span className="sr-only">Standard error: </span>
                ) : null}
                <span className="min-w-0 break-words whitespace-pre-wrap">
                  {entry.text || " "}
                </span>
              </li>
            ))}
          </ol>
        </ScrollArea>
      )}
    </div>
  )
}

function BuildProblems({
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

function PanelPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <p className="max-w-md text-center text-xs text-muted-foreground">
        {children}
      </p>
    </div>
  )
}

/**
 * latexmk keeps a database of the previous run. When nothing has changed since
 * a failure it reports that stored error and compiles nothing, which reads like
 * an unexplained failure until the generated files are removed.
 */
function replaysCachedFailure(run: BuildRun | null): boolean {
  return (
    run?.status === "failed" &&
    run.entries.some((entry) =>
      entry.text.includes("gave an error in previous invocation of latexmk")
    )
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

function watchLabel(state: ProjectWatchState): string | null {
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

function runLabel(run: BuildRun, index: number): string {
  const time = formatRunTime(run.startedAt)
  return index === 0
    ? `Latest · ${statusLabel(run.status)}`
    : `${time} · ${statusLabel(run.status)}`
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
