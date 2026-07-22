import { useState } from "react"
import type { Dispatch, ReactElement } from "react"
import {
  CircleStop,
  Hammer,
  Eye,
  Settings2,
  FolderOpen,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  selectedBuildRun,
  type BuildEngine,
  type BuildProfilesState,
  type ProjectBuildAction,
  type ProjectBuildState,
  type ProjectBuildConfiguration,
  type ProjectBuildConfigurationState,
} from "@/domain/build"
import type { BuildPanelTab } from "@/domain/project"
import type { ProjectRelativePath } from "@/domain/identifiers"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import {
  diagnosticSummary,
  runLabel,
  statusLabel,
} from "@/features/build/build-panel-model"
import { BuildOutput } from "@/features/build/build-output"
import { BuildProblems } from "@/features/build/build-problems"
import { BuildProfileSelect } from "@/features/build/build-profile-select"
import { BuildStatus } from "@/features/build/build-status"
import { LatexToolBanner } from "@/features/build/latex-tool-banner"
import { BuildConfigurationDialog } from "@/features/build/build-configuration-dialog"
import { LatexInstallDialog } from "@/features/build/latex-install-dialog"
import { useInstallCompletionNotice } from "@/features/build/use-install-completion-notice"
import { useLatexInstall } from "@/features/build/use-latex-install"

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
  useInstallCompletionNotice({
    acknowledge: install.acknowledgeNotice,
    notice: install.notice,
    onOpenDetails: () => setInstallOpen(true),
    suppressed: installOpen,
  })
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
            <TabsTrigger className="px-3 text-xs" value="output">
              Output
            </TabsTrigger>
            <TabsTrigger className="px-3 text-xs" value="problems">
              Problems
              {problemCount === 0 ? null : (
                <Badge className="h-4 px-1.5 text-micro" variant="secondary">
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
