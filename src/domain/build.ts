import type { ProjectError } from "@/domain/project"
import type {
  BuildId,
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"

export type BuildEngine = "latexmkPdf" | "pdfLatex" | "xeLatex" | "luaLatex"

export type BuildStatus = "running" | "succeeded" | "failed" | "cancelled"
export type BuildLogStream = "stdout" | "stderr"
export type DiagnosticSeverity = "error" | "warning"

export type WatchStatus =
  | "off"
  | "starting"
  | "watching"
  | "buildQueued"
  | "building"
  | "stopping"
  | "error"
  | "pausedUnsafe"

export type WatchEvent =
  | Readonly<{
      kind: "status"
      projectPath: CanonicalProjectPath
      status: WatchStatus
      message: string | null
    }>
  | Readonly<{
      kind: "changed"
      projectPath: CanonicalProjectPath
      changes: ReadonlyArray<"create" | "modify" | "remove" | "rename">
      paths: ReadonlyArray<ProjectRelativePath>
      truncated: boolean
    }>

export type BuildRequest = Readonly<{
  projectPath: CanonicalProjectPath
  rootFile: ProjectRelativePath
  engine: BuildEngine
}>

export type BibliographyTool = "automatic" | "biber" | "bibtex" | "none"

export type EnvironmentSetting = Readonly<{ name: string; value: string }>

export type ProjectBuildConfiguration = Readonly<{
  schemaVersion: 1
  rootFile: string | null
  outputDirectory: string | null
  bibliographyTool: BibliographyTool
  generatedDirectories: ReadonlyArray<string>
  environment: ReadonlyArray<EnvironmentSetting>
  customCommand: Readonly<{
    executable: string
    arguments: ReadonlyArray<string>
  }> | null
}>

export type ProjectBuildConfigurationState =
  | { status: "loading" }
  | { status: "ready"; configuration: ProjectBuildConfiguration }
  | { status: "error"; error: ProjectError }

export type CleanPreview = Readonly<{
  files: ReadonlyArray<ProjectRelativePath>
  totalBytes: number
  truncated: boolean
}>

export type BuildInvocation = Readonly<{
  executable: string
  arguments: ReadonlyArray<string>
  workingDirectory: CanonicalProjectPath
  rootFile: ProjectRelativePath
  engine: BuildEngine
  environment: ReadonlyArray<EnvironmentSetting>
  bibliographyTool: BibliographyTool
  custom: boolean
}>

export type BuildProfile = Readonly<{
  engine: BuildEngine
  label: string
  description: string
  executable: string
  recommended: boolean
  available: boolean
}>

export type BuildProfilesState =
  | { status: "loading" }
  | { status: "ready"; profiles: BuildProfile[] }
  | { status: "error"; error: ProjectError }

export type BuildLogEntry = Readonly<{
  sequence: number
  timestamp: number
  stream: BuildLogStream
  text: string
}>

export type BuildDiagnostic = Readonly<{
  severity: DiagnosticSeverity
  message: string
  file: ProjectRelativePath | null
  line: number | null
  mappingUncertain: boolean
  logSequence: number
}>

export type BuildRun = Readonly<{
  id: BuildId
  projectPath: CanonicalProjectPath
  invocation: BuildInvocation
  status: BuildStatus
  startedAt: number
  finishedAt: number | null
  exitCode: number | null
  entries: ReadonlyArray<BuildLogEntry>
  diagnostics: ReadonlyArray<BuildDiagnostic>
}>

export type BuildEvent =
  | Readonly<{
      kind: "log"
      projectPath: CanonicalProjectPath
      runId: BuildId
      entry: BuildLogEntry
      diagnostic: BuildDiagnostic | null
    }>
  | Readonly<{
      kind: "finished"
      projectPath: CanonicalProjectPath
      runId: BuildId
      status: Exclude<BuildStatus, "running">
      finishedAt: number
      exitCode: number | null
    }>

export type BuildPreviewState =
  | { status: "unavailable"; reason: string }
  | { status: "loading" }
  | { status: "ready"; invocation: BuildInvocation }
  | { status: "error"; error: ProjectError }

export type ProjectBuildState = {
  preview: BuildPreviewState
  runs: BuildRun[]
  selectedRunId: BuildId | null
  action:
    | { status: "idle" }
    | { status: "pending" }
    | { status: "error"; error: ProjectError }
  pendingEvents: BuildEvent[]
}

export type ProjectBuildAction =
  | { type: "previewLoading" }
  | { type: "previewReady"; invocation: BuildInvocation }
  | { type: "previewError"; error: ProjectError }
  | { type: "rootUnavailable"; reason: string }
  | { type: "historyLoaded"; runs: ReadonlyArray<BuildRun> }
  | { type: "historyError"; error: ProjectError }
  | { type: "actionPending" }
  | { type: "actionError"; error: ProjectError }
  | { type: "actionCleared" }
  | { type: "runStarted"; run: BuildRun }
  | { type: "eventReceived"; event: BuildEvent }
  | { type: "selectRun"; runId: BuildId }

const MAX_VISIBLE_RUNS = 10
const MAX_VISIBLE_LOG_ENTRIES = 500
const MAX_VISIBLE_LOG_BYTES = 512 * 1024
const MAX_PENDING_BUILD_EVENTS = 512

export const initialProjectBuildState: ProjectBuildState = {
  preview: {
    status: "unavailable",
    reason: "Choose a LaTeX root file to prepare a build.",
  },
  runs: [],
  selectedRunId: null,
  action: { status: "idle" },
  pendingEvents: [],
}

export function projectBuildReducer(
  state: ProjectBuildState,
  action: ProjectBuildAction
): ProjectBuildState {
  switch (action.type) {
    case "previewLoading":
      return { ...state, preview: { status: "loading" } }
    case "previewReady":
      return {
        ...state,
        preview: { status: "ready", invocation: action.invocation },
      }
    case "previewError":
      return { ...state, preview: { status: "error", error: action.error } }
    case "rootUnavailable":
      return {
        ...state,
        preview: { status: "unavailable", reason: action.reason },
      }
    case "historyLoaded":
      return applyPendingEvents({
        ...state,
        runs: mergeRuns(action.runs, state.runs),
        selectedRunId:
          state.selectedRunId ??
          action.runs[0]?.id ??
          state.runs[0]?.id ??
          null,
        action: { status: "idle" },
      })
    case "historyError":
    case "actionError":
      return { ...state, action: { status: "error", error: action.error } }
    case "actionPending":
      return { ...state, action: { status: "pending" } }
    case "actionCleared":
      // A retained failure describes an environment that no longer applies;
      // the retained runs and their logs are left untouched.
      return state.action.status === "error"
        ? { ...state, action: { status: "idle" } }
        : state
    case "runStarted":
      return applyPendingEvents({
        ...state,
        runs: [
          action.run,
          ...state.runs.filter((run) => run.id !== action.run.id),
        ].slice(0, MAX_VISIBLE_RUNS),
        selectedRunId: action.run.id,
        action: { status: "idle" },
      })
    case "eventReceived":
      if (!state.runs.some((run) => run.id === action.event.runId)) {
        return {
          ...state,
          pendingEvents: [...state.pendingEvents, action.event].slice(
            -MAX_PENDING_BUILD_EVENTS
          ),
        }
      }
      return {
        ...state,
        runs: state.runs.map((run) => updateRun(run, action.event)),
        action: { status: "idle" },
      }
    case "selectRun":
      return { ...state, selectedRunId: action.runId }
  }
}

function updateRun(run: BuildRun, event: BuildEvent): BuildRun {
  if (run.id !== event.runId) return run
  if (event.kind === "finished") {
    return {
      ...run,
      status: event.status,
      finishedAt: event.finishedAt,
      exitCode: event.exitCode,
    }
  }
  if (run.entries.some((entry) => entry.sequence === event.entry.sequence)) {
    return run
  }
  const entries = retainLogEntries([...run.entries, event.entry])
  const retainedSequences = new Set(entries.map((entry) => entry.sequence))
  return {
    ...run,
    entries,
    diagnostics: (event.diagnostic === null
      ? run.diagnostics
      : [...run.diagnostics, event.diagnostic]
    ).filter((diagnostic) => retainedSequences.has(diagnostic.logSequence)),
  }
}

function retainLogEntries(entries: BuildLogEntry[]): BuildLogEntry[] {
  let retainedBytes = 0
  const retained: BuildLogEntry[] = []
  for (
    let index = entries.length - 1;
    index >= 0 && retained.length < MAX_VISIBLE_LOG_ENTRIES;
    index -= 1
  ) {
    const entry = entries[index]
    if (entry === undefined) continue
    const nextBytes = retainedBytes + entry.text.length
    if (nextBytes > MAX_VISIBLE_LOG_BYTES && retained.length > 0) break
    retained.push(entry)
    retainedBytes = nextBytes
  }
  retained.reverse()
  return retained
}

function applyPendingEvents(state: ProjectBuildState): ProjectBuildState {
  const applicable = state.pendingEvents.filter((event) =>
    state.runs.some((run) => run.id === event.runId)
  )
  return {
    ...state,
    runs: applicable.reduce(
      (runs, event) => runs.map((run) => updateRun(run, event)),
      state.runs
    ),
    pendingEvents: state.pendingEvents.filter(
      (event) => !applicable.includes(event)
    ),
  }
}

function mergeRuns(
  fromBackend: ReadonlyArray<BuildRun>,
  local: ReadonlyArray<BuildRun>
): BuildRun[] {
  const backendIds = new Set(fromBackend.map((run) => run.id))
  const merged = fromBackend.map((run) => {
    const localRun = local.find((candidate) => candidate.id === run.id)
    if (localRun === undefined) return run
    const entries = [...run.entries]
    for (const entry of localRun.entries) {
      if (!entries.some((candidate) => candidate.sequence === entry.sequence)) {
        entries.push(entry)
      }
    }
    entries.sort((left, right) => left.sequence - right.sequence)
    const diagnostics = [...run.diagnostics]
    for (const diagnostic of localRun.diagnostics) {
      if (
        !diagnostics.some(
          (candidate) => candidate.logSequence === diagnostic.logSequence
        )
      ) {
        diagnostics.push(diagnostic)
      }
    }
    return { ...run, entries, diagnostics }
  })
  return [...merged, ...local.filter((run) => !backendIds.has(run.id))].slice(
    0,
    MAX_VISIBLE_RUNS
  )
}

export function selectedBuildRun(state: ProjectBuildState): BuildRun | null {
  return state.runs.find((run) => run.id === state.selectedRunId) ?? null
}

export function formatBuildInvocation(
  invocation: Pick<BuildInvocation, "executable" | "arguments">
): string {
  return [invocation.executable, ...invocation.arguments]
    .map((part) => (/^[\w./=+-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ")
}
