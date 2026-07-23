import { useState } from "react"
import type { Dispatch, ReactElement, ReactNode } from "react"
import { Menu } from "@base-ui/react/menu"
import {
  CircleStop,
  Hammer,
  Eye,
  EllipsisVertical,
  Settings2,
  FolderOpen,
  Trash2,
  Wrench,
} from "lucide-react"

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
import {
  selectedBuildRun,
  type BuildEngine,
  type BuildProfilesState,
  type ProjectBuildAction,
  type ProjectBuildState,
  type ProjectBuildConfiguration,
  type ProjectBuildConfigurationState,
} from "@/domain/build"
import type { ProjectWatchState } from "@/features/build/use-project-watch"
import {
  buildIssue,
  diagnosticSummary,
  runLabel,
  statusLabel,
} from "@/features/build/build-panel-model"
import { BuildOutput } from "@/features/build/build-output"
import { BuildProfileSelect } from "@/features/build/build-profile-select"
import { BuildStatus } from "@/features/build/build-status"
import { BuildToolsDialog } from "@/features/build/build-tools-dialog"
import { LatexToolBanner } from "@/features/build/latex-tool-banner"
import { BuildConfigurationDialog } from "@/features/build/build-configuration-dialog"
import { LatexInstallDialog } from "@/features/build/latex-install-dialog"
import { useInstallCompletionNotice } from "@/features/build/use-install-completion-notice"
import { useLatexInstall } from "@/features/build/use-latex-install"

/**
 * The build surface: what the build is doing, the controls that change it, and
 * the compiler's own log. Diagnostics live in the dock's Problems tab alongside
 * the editor's, so the same question is never answered in two places.
 */
export function BuildPanel({
  dispatch,
  logContextSequence,
  configurationState,
  engine,
  onBuild,
  onStop,
  onStartWatch,
  onStopWatch,
  onSaveConfiguration,
  onClean,
  onLatexInstalled,
  onRevealOutput,
  profiles,
  queued,
  rootCandidates,
  setEngine,
  state,
  watch,
}: {
  dispatch: Dispatch<ProjectBuildAction>
  logContextSequence: number | null
  configurationState: ProjectBuildConfigurationState
  engine: BuildEngine
  onBuild: () => void
  onStop: () => void
  onStartWatch: () => void
  onStopWatch: () => void
  onSaveConfiguration: (
    configuration: ProjectBuildConfiguration
  ) => Promise<void>
  onClean: () => void
  onLatexInstalled: () => void
  onRevealOutput: () => void
  profiles: BuildProfilesState
  /** A build requested while another was running; it starts when that ends. */
  queued: boolean
  /** Every `.tex` file in the project, for the root-file picker. */
  rootCandidates: ReadonlyArray<string>
  setEngine: (engine: BuildEngine) => void
  state: ProjectBuildState
  watch: ProjectWatchState
}): ReactElement {
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const install = useLatexInstall({ onInstalled: onLatexInstalled })
  // An install changes what the distribution provides, so the tools are
  // re-detected before the panel offers a rebuild — the reconciliation rule in
  // `ui-ux-requirements.md`, with `use-latex-install.ts` as the reference.
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
  // engines that did arrive beats leaving the user at a dead end — but a
  // profile that resolves references is preferred over one that does not, and
  // the banner says which kind it found.
  const available =
    missingProfile === null || profiles.status !== "ready"
      ? []
      : profiles.profiles.filter(
          (profile) => profile.engine !== engine && profile.available
        )
  const installedAlternative =
    available.find((profile) => profile.resolvesReferences) ??
    available[0] ??
    null
  const canBuild =
    state.preview.status === "ready" && profileAvailable && !running && !pending
  const issue = buildIssue(state, profiles)
  const watchActive = watch.status !== "off" && watch.status !== "error"

  return (
    <section
      aria-label="Build"
      className="relative flex size-full min-h-0 flex-col bg-workspace-chrome"
    >
      <div className="flex h-9 min-w-0 shrink-0 items-center gap-3 border-b px-2">
        <BuildStatus
          issue={issue}
          queued={queued}
          run={run}
          state={state}
          watch={watch}
        />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {state.runs.length > 1 ? (
            <Select
              aria-label="Build run"
              onValueChange={(runId) => {
                if (runId !== null) dispatch({ type: "selectRun", runId })
              }}
              value={state.selectedRunId ?? undefined}
            >
              <SelectTrigger aria-label="Build run" className="w-36" size="sm">
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
            aria-label="Rebuild on save"
            aria-pressed={watchActive}
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
          <Separator className="mx-0.5 h-4" orientation="vertical" />
          <BuildActionsMenu>
            <BuildMenuItem onClick={onClean} disabled={running}>
              <Trash2 aria-hidden="true" data-icon="inline-start" />
              Preview and clean auxiliary files
            </BuildMenuItem>
            <BuildMenuItem onClick={onRevealOutput}>
              <FolderOpen aria-hidden="true" data-icon="inline-start" />
              Reveal built PDF
            </BuildMenuItem>
            <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
            <BuildMenuItem onClick={() => setToolsOpen(true)}>
              <Wrench aria-hidden="true" data-icon="inline-start" />
              Show the LaTeX tools TeX found
            </BuildMenuItem>
            <BuildMenuItem
              disabled={configurationState.status !== "ready"}
              onClick={() => setConfigurationOpen(true)}
            >
              <Settings2 aria-hidden="true" data-icon="inline-start" />
              Configure project build
            </BuildMenuItem>
          </BuildActionsMenu>
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
      <div className="min-h-0 flex-1">
        <BuildOutput
          contextSequence={logContextSequence}
          run={run}
          state={state}
        />
      </div>

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
      <BuildToolsDialog onOpenChange={setToolsOpen} open={toolsOpen} />
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
          rootCandidates={rootCandidates}
        />
      ) : null}
    </section>
  )
}

/**
 * The occasional build actions, behind one control instead of four icons whose
 * meaning had to be guessed. Each item names its effect in full; the same
 * actions stay reachable from the command palette.
 */
function BuildActionsMenu({ children }: { children: ReactNode }): ReactElement {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            aria-label="More build actions"
            size="icon-sm"
            title="More build actions"
            variant="ghost"
          >
            <EllipsisVertical aria-hidden="true" />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end" side="bottom" sideOffset={4}>
          <Menu.Popup className="z-50 min-w-44 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-popover outline-none">
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function BuildMenuItem({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}): ReactElement {
  return (
    <Menu.Item
      className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Menu.Item>
  )
}
