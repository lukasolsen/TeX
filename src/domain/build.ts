import type { ProjectError } from "@/domain/project"

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
  | {
      kind: "status"
      projectPath: string
      status: WatchStatus
      message: string | null
    }
  | {
      kind: "changed"
      projectPath: string
      changes: Array<"create" | "modify" | "remove" | "rename">
      paths: string[]
      truncated: boolean
    }

export type BuildRequest = {
  projectPath: string
  rootFile: string
  engine: BuildEngine
}

export type BibliographyTool = "automatic" | "biber" | "bibtex" | "none"

export type EnvironmentSetting = { name: string; value: string }

export type ProjectBuildConfiguration = {
  schemaVersion: 1
  rootFile: string | null
  outputDirectory: string | null
  bibliographyTool: BibliographyTool
  generatedDirectories: string[]
  environment: EnvironmentSetting[]
  customCommand: { executable: string; arguments: string[] } | null
}

export type ProjectBuildConfigurationState =
  | { status: "loading" }
  | { status: "ready"; configuration: ProjectBuildConfiguration }
  | { status: "error"; error: ProjectError }

export type CleanPreview = {
  files: string[]
  totalBytes: number
  truncated: boolean
}

export type BuildInvocation = {
  executable: string
  arguments: string[]
  workingDirectory: string
  rootFile: string
  engine: BuildEngine
  environment: EnvironmentSetting[]
  bibliographyTool: BibliographyTool
  custom: boolean
  toolVersion: string | null
}

export type BuildProfile = {
  engine: BuildEngine
  label: string
  description: string
  executable: string
  recommended: boolean
  available: boolean
}

export type BuildProfilesState =
  | { status: "loading" }
  | { status: "ready"; profiles: BuildProfile[] }
  | { status: "error"; error: ProjectError }

export type BuildLogEntry = {
  sequence: number
  timestamp: number
  stream: BuildLogStream
  text: string
}

export type BuildDiagnostic = {
  severity: DiagnosticSeverity
  message: string
  file: string | null
  line: number | null
  mappingUncertain: boolean
  logSequence: number
}

export type BuildRun = {
  id: string
  projectPath: string
  invocation: BuildInvocation
  status: BuildStatus
  startedAt: number
  finishedAt: number | null
  exitCode: number | null
  entries: BuildLogEntry[]
  diagnostics: BuildDiagnostic[]
}

export type BuildEvent =
  | {
      kind: "log"
      projectPath: string
      runId: string
      entry: BuildLogEntry
      diagnostic: BuildDiagnostic | null
    }
  | {
      kind: "finished"
      projectPath: string
      runId: string
      status: Exclude<BuildStatus, "running">
      finishedAt: number
      exitCode: number | null
    }

export type BuildPreviewState =
  | { status: "unavailable"; reason: string }
  | { status: "loading" }
  | { status: "ready"; invocation: BuildInvocation }
  | { status: "error"; error: ProjectError }

export type ProjectBuildState = {
  preview: BuildPreviewState
  runs: BuildRun[]
  selectedRunId: string | null
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
  | { type: "historyLoaded"; runs: BuildRun[] }
  | { type: "historyError"; error: ProjectError }
  | { type: "actionPending" }
  | { type: "actionError"; error: ProjectError }
  | { type: "runStarted"; run: BuildRun }
  | { type: "eventReceived"; event: BuildEvent }
  | { type: "selectRun"; runId: string }

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
    case "runStarted":
      return applyPendingEvents({
        ...state,
        runs: [
          action.run,
          ...state.runs.filter((run) => run.id !== action.run.id),
        ],
        selectedRunId: action.run.id,
        action: { status: "idle" },
      })
    case "eventReceived":
      if (!state.runs.some((run) => run.id === action.event.runId)) {
        return {
          ...state,
          pendingEvents: [...state.pendingEvents, action.event],
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
  return {
    ...run,
    entries: [...run.entries, event.entry],
    diagnostics:
      event.diagnostic === null
        ? run.diagnostics
        : [...run.diagnostics, event.diagnostic],
  }
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

function mergeRuns(fromBackend: BuildRun[], local: BuildRun[]): BuildRun[] {
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
  return [...merged, ...local.filter((run) => !backendIds.has(run.id))]
}

export function selectedBuildRun(state: ProjectBuildState): BuildRun | null {
  return state.runs.find((run) => run.id === state.selectedRunId) ?? null
}

export function formatBuildInvocation(invocation: BuildInvocation): string {
  return [invocation.executable, ...invocation.arguments]
    .map((part) => (/^[\w./=+-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ")
}
