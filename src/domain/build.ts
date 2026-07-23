import type { ProjectError } from "@/domain/project"
import type {
  BuildId,
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"

export type BuildEngine = "latexmkPdf" | "pdfLatex" | "xeLatex" | "luaLatex"

/**
 * What a run turned out to be. Not the exit code: latexmk can exit 0 having
 * written nothing, and an engine in nonstopmode routinely exits non-zero having
 * written a usable PDF. The artifact decides.
 */
export type BuildStatus =
  | "running"
  | "succeeded"
  | "succeededWithProblems"
  | "failed"
  | "cancelled"
  | "timedOut"
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

/**
 * Whether the bibliography runs — not which tool runs it. latexmk chooses biber
 * or bibtex from the presence of a `.bcf`, so a setting that named the tool
 * could not honour the claim; the run reports which tool ran instead.
 */
export type BibliographyMode = "automatic" | "always" | "never"

export type EnvironmentSetting = Readonly<{ name: string; value: string }>

export type ProjectBuildConfiguration = Readonly<{
  schemaVersion: 2
  rootFile: string | null
  outputDirectory: string | null
  bibliography: BibliographyMode
  generatedDirectories: ReadonlyArray<string>
  environment: ReadonlyArray<EnvironmentSetting>
  customCommand: Readonly<{
    executable: string
    arguments: ReadonlyArray<string>
  }> | null
  /** Shell escape on the standard invocation, consented natively. */
  shellEscape: boolean
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
  bibliography: BibliographyMode
  /** False for the single-pass profile, which resolves no cross-references. */
  resolvesReferences: boolean
  custom: boolean
}>

export type BuildProfile = Readonly<{
  engine: BuildEngine
  label: string
  description: string
  executable: string
  resolvesReferences: boolean
  recommended: boolean
  available: boolean
}>

/** One tool the build path can use, and what stops working without it. */
export type ToolReport = Readonly<{
  name: string
  purpose: string
  /** What TeX cannot do while this is missing. */
  absence: string
  available: boolean
  path: string | null
}>

/** Which TeX distribution answered, so several installs stay distinguishable. */
export type DistributionReport = Readonly<{
  label: string
  directory: string
}>

export type BuildToolReport = Readonly<{
  tools: ReadonlyArray<ToolReport>
  distribution: DistributionReport | null
}>

/** The package providing a file a build could not find. */
export type PackageCandidate = Readonly<{
  file: string
  package: string
  command: string
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

/**
 * The closed set of problems TeX explains in its own words. `compilerMessage`
 * carries anything not recognised, with the compiler's wording intact.
 */
export type DiagnosticCode =
  | "undefinedControlSequence"
  | "missingPackage"
  | "missingFile"
  | "undefinedReference"
  | "undefinedCitation"
  | "missingDollar"
  | "runawayArgument"
  | "tooManyBraces"
  | "overfullBox"
  | "underfullBox"
  | "rerunLimit"
  | "bibliographyFailed"
  | "compilerMessage"

export type BuildDiagnostic = Readonly<{
  code: DiagnosticCode
  severity: DiagnosticSeverity
  /** One sentence naming what is wrong and what would resolve it. */
  message: string
  /** The compiler's own line, kept so the translation never hides it. */
  raw: string
  /** The `l.NN` source excerpt, when the engine printed one. */
  context: string | null
  file: ProjectRelativePath | null
  line: number | null
  mappingUncertain: boolean
  /** How many passes reported this; 1 unless latexmk repeated it. */
  occurrences: number
  logSequence: number | null
}>

/**
 * What the run is doing right now, read from output the engine already
 * produces. An indefinite spinner is not evidence of work.
 */
export type BuildProgress = Readonly<{
  /** Passes latexmk has announced; 0 before the first announcement. */
  pass: number
  /** The tool that pass is running, as latexmk named it. */
  tool: string | null
  /** Pages shipped so far, from the engine's `[n]` markers. */
  pages: number
  /** The engine's own closing summary, once it prints one. */
  summary: string | null
}>

export const initialBuildProgress: BuildProgress = {
  pass: 0,
  tool: null,
  pages: 0,
  summary: null,
}

export type BuildRun = Readonly<{
  id: BuildId
  projectPath: CanonicalProjectPath
  invocation: BuildInvocation
  status: BuildStatus
  /** One sentence explaining a terminal status; null while running. */
  reason: string | null
  /** True when this run wrote the PDF, so a failed run's output is usable. */
  pdfFresh: boolean
  startedAt: number
  finishedAt: number | null
  exitCode: number | null
  entries: ReadonlyArray<BuildLogEntry>
  diagnostics: ReadonlyArray<BuildDiagnostic>
  progress: BuildProgress
}>

export type BuildEvent =
  | Readonly<{
      kind: "log"
      projectPath: CanonicalProjectPath
      runId: BuildId
      /** One flush of output, in order. */
      entries: ReadonlyArray<BuildLogEntry>
      diagnostics: ReadonlyArray<BuildDiagnostic>
      /** Present only when this batch changed what the run is doing. */
      progress: BuildProgress | null
    }>
  | Readonly<{
      kind: "finished"
      projectPath: CanonicalProjectPath
      runId: BuildId
      status: Exclude<BuildStatus, "running">
      reason: string
      pdfFresh: boolean
      finishedAt: number
      exitCode: number | null
      /** Read from the engine's `.log`; replaces what the stream produced. */
      diagnostics: ReadonlyArray<BuildDiagnostic>
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
const MAX_VISIBLE_DIAGNOSTICS = 500
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
      reason: event.reason,
      pdfFresh: event.pdfFresh,
      finishedAt: event.finishedAt,
      exitCode: event.exitCode,
      // The log-derived set is authoritative. It arrives complete, so it
      // replaces rather than merges with what the stream guessed live.
      diagnostics:
        event.diagnostics.length > 0 ? [...event.diagnostics] : run.diagnostics,
    }
  }
  // The backend numbers sequences monotonically, so an entry already present
  // means that part of the flush was already applied.
  const seen = new Set(run.entries.map((entry) => entry.sequence))
  const arriving = event.entries.filter((entry) => !seen.has(entry.sequence))
  if (arriving.length === 0 && event.progress === null) return run
  // Diagnostics are retained independently of the log lines that carried them.
  // Errors arrive early and the log is trimmed from the middle, so tying a
  // diagnostic's lifetime to its line would drop the first error of every long
  // build — the one worth reading.
  return {
    ...run,
    entries: retainLogEntries([...run.entries, ...arriving]),
    diagnostics: [...run.diagnostics, ...event.diagnostics].slice(
      -MAX_VISIBLE_DIAGNOSTICS
    ),
    progress: event.progress ?? run.progress,
  }
}

/**
 * Keeps the head and the tail of a long log. The backend trims the same way
 * and marks the gap with a sequence-zero notice, which is preserved here.
 */
function retainLogEntries(entries: BuildLogEntry[]): BuildLogEntry[] {
  if (entries.length <= MAX_VISIBLE_LOG_ENTRIES) return entries
  const head = Math.floor(MAX_VISIBLE_LOG_ENTRIES / 4)
  const tail = MAX_VISIBLE_LOG_ENTRIES - head
  let retainedBytes = 0
  const retainedTail: BuildLogEntry[] = []
  for (
    let index = entries.length - 1;
    index >= head && retainedTail.length < tail;
    index -= 1
  ) {
    const entry = entries[index]
    if (entry === undefined) continue
    const nextBytes = retainedBytes + entry.text.length
    if (nextBytes > MAX_VISIBLE_LOG_BYTES && retainedTail.length > 0) break
    retainedTail.push(entry)
    retainedBytes = nextBytes
  }
  retainedTail.reverse()
  return [...entries.slice(0, head), ...retainedTail]
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

/** Narrows an unknown value to a supported build engine. */
export function isBuildEngine(value: unknown): value is BuildEngine {
  return (
    value === "latexmkPdf" ||
    value === "pdfLatex" ||
    value === "xeLatex" ||
    value === "luaLatex"
  )
}

/** Narrows a nullable string to a supported bibliography mode. */
export function isBibliographyMode(
  value: string | null
): value is BibliographyMode {
  return ["automatic", "always", "never"].includes(value ?? "")
}

/** Renders a diagnostic as `file:line: SEVERITY: message` for copy-out. */
export function formatDiagnostic(diagnostic: BuildDiagnostic): string {
  const location =
    diagnostic.file === null
      ? ""
      : `${diagnostic.file}${diagnostic.line === null ? "" : `:${diagnostic.line}`}: `
  return `${location}${diagnostic.severity.toUpperCase()}: ${diagnostic.message}`
}
