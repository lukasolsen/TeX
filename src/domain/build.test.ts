import { describe, expect, it } from "vitest"

import {
  formatBuildInvocation,
  initialBuildProgress,
  initialProjectBuildState,
  projectBuildReducer,
  selectedBuildRun,
  type BuildEvent,
  type BuildInvocation,
  type BuildLogEntry,
  type BuildRun,
} from "@/domain/build"
import {
  buildId,
  canonicalProjectPath,
  projectRelativePath,
} from "@/domain/identifiers"

const projectPath = canonicalProjectPath("/project")
const rootFile = projectRelativePath("chapter one.tex")
const runId = buildId("1-1")

const invocation: BuildInvocation = {
  executable: "latexmk",
  arguments: ["-pdf", "chapter one.tex"],
  workingDirectory: projectPath,
  rootFile,
  engine: "latexmkPdf",
  environment: [],
  bibliography: "automatic",
  resolvesReferences: true,
  custom: false,
}

const running: BuildRun = {
  id: runId,
  projectPath,
  invocation,
  status: "running",
  reason: null,
  pdfFresh: false,
  startedAt: 1,
  finishedAt: null,
  exitCode: null,
  entries: [],
  diagnostics: [],
  progress: initialBuildProgress,
}

describe("projectBuildReducer", () => {
  it("retains raw output and parsed diagnostics for a run", () => {
    let state = projectBuildReducer(initialProjectBuildState, {
      type: "runStarted",
      run: running,
    })
    state = projectBuildReducer(state, {
      type: "eventReceived",
      event: {
        kind: "log",
        projectPath,
        runId,
        entries: [
          { sequence: 1, timestamp: 2, stream: "stderr", text: "error" },
        ],
        diagnostics: [
          {
            code: "compilerMessage",
            severity: "error",
            message: "Undefined control sequence",
            raw: "Undefined control sequence",
            context: null,
            occurrences: 1,
            file: projectRelativePath("main.tex"),
            line: 4,
            mappingUncertain: false,
            logSequence: 1,
          },
        ],
        progress: null,
      },
    })

    expect(selectedBuildRun(state)?.entries).toHaveLength(1)
    expect(selectedBuildRun(state)?.diagnostics).toHaveLength(1)
  })

  it("finishes a run without erasing its output", () => {
    const entries: BuildLogEntry[] = [
      { sequence: 1, timestamp: 2, stream: "stdout", text: "done" },
    ]
    const withOutput = {
      ...running,
      entries,
    }
    let state = projectBuildReducer(initialProjectBuildState, {
      type: "runStarted",
      run: withOutput,
    })
    state = projectBuildReducer(state, {
      type: "eventReceived",
      event: {
        kind: "finished",
        projectPath,
        runId,
        status: "failed",
        reason: "The build stopped without writing a PDF.",
        pdfFresh: false,
        finishedAt: 3,
        exitCode: 1,
        diagnostics: [],
      },
    })

    expect(selectedBuildRun(state)).toMatchObject({
      status: "failed",
      exitCode: 1,
      entries: withOutput.entries,
    })
  })

  it("applies output that arrives before the start response", () => {
    const event: BuildEvent = {
      kind: "log",
      projectPath,
      runId,
      entries: [{ sequence: 1, timestamp: 2, stream: "stdout", text: "fast" }],
      diagnostics: [],
      progress: null,
    }
    let state = projectBuildReducer(initialProjectBuildState, {
      type: "eventReceived",
      event,
    })
    state = projectBuildReducer(state, { type: "runStarted", run: running })

    expect(selectedBuildRun(state)?.entries[0]?.text).toBe("fast")
    expect(state.pendingEvents).toHaveLength(0)
  })

  it("reconciles a missed completion event from backend history", () => {
    let state = projectBuildReducer(initialProjectBuildState, {
      type: "runStarted",
      run: running,
    })
    state = projectBuildReducer(state, {
      type: "historyLoaded",
      runs: [
        {
          ...running,
          status: "succeeded",
          reason: "The build stopped without writing a PDF.",
          pdfFresh: false,
          finishedAt: 4,
          exitCode: 0,
          entries: [
            {
              sequence: 1,
              timestamp: 2,
              stream: "stdout",
              text: "Latexmk: All targets are up-to-date",
            },
          ],
        },
      ],
    })

    expect(selectedBuildRun(state)).toMatchObject({
      status: "succeeded",
      reason: "The build stopped without writing a PDF.",
      pdfFresh: false,
      finishedAt: 4,
      exitCode: 0,
      diagnostics: [],
    })
    expect(selectedBuildRun(state)?.entries).toHaveLength(1)
  })

  it("bounds live log and pre-response event retention", () => {
    let runningState = projectBuildReducer(initialProjectBuildState, {
      type: "runStarted",
      run: running,
    })
    for (let sequence = 1; sequence <= 600; sequence += 1) {
      runningState = projectBuildReducer(runningState, {
        type: "eventReceived",
        event: {
          kind: "log",
          projectPath,
          runId,
          entries: [
            {
              sequence,
              timestamp: sequence,
              stream: "stdout",
              text: "line",
            },
          ],
          diagnostics: [],
          progress: null,
        },
      })
    }
    // Head and tail, not tail alone: LaTeX reports its first error early, so
    // keeping only the newest lines discards the part worth reading.
    const retained = selectedBuildRun(runningState)?.entries
    expect(retained).toHaveLength(500)
    expect(retained?.[0]?.sequence).toBe(1)
    expect(retained?.at(-1)?.sequence).toBe(600)

    let pendingState = initialProjectBuildState
    for (let sequence = 1; sequence <= 600; sequence += 1) {
      pendingState = projectBuildReducer(pendingState, {
        type: "eventReceived",
        event: {
          kind: "finished",
          projectPath,
          runId: buildId(`2-${sequence}`),
          status: "failed",
          reason: "The build stopped without writing a PDF.",
          pdfFresh: false,
          finishedAt: sequence,
          exitCode: 1,
          diagnostics: [],
        },
      })
    }
    expect(pendingState.pendingEvents).toHaveLength(512)
  })

  /// A long build trims its log, and the first error is what gets trimmed.
  /// Tying a diagnostic's lifetime to its log line emptied the Problems panel
  /// of exactly the problem the reader needed.
  it("keeps a diagnostic after its log line is trimmed away", () => {
    const started: BuildRun = { ...running, id: runId, status: "running" }
    let state = projectBuildReducer(initialProjectBuildState, {
      type: "runStarted",
      run: started,
    })
    state = projectBuildReducer(state, {
      type: "eventReceived",
      event: {
        kind: "log",
        projectPath,
        runId,
        entries: [
          { sequence: 1, timestamp: 1, stream: "stderr", text: "boom" },
        ],
        diagnostics: [
          {
            code: "undefinedControlSequence",
            severity: "error",
            message: "\\qed isn't a known command here.",
            raw: "! Undefined control sequence.",
            context: "l.12 \\qed",
            occurrences: 1,
            file: projectRelativePath("main.tex"),
            line: 12,
            mappingUncertain: false,
            logSequence: 1,
          },
        ],
        progress: null,
      },
    })
    for (let sequence = 2; sequence <= 900; sequence += 1) {
      state = projectBuildReducer(state, {
        type: "eventReceived",
        event: {
          kind: "log",
          projectPath,
          runId,
          entries: [
            { sequence, timestamp: sequence, stream: "stdout", text: "x" },
          ],
          diagnostics: [],
          progress: null,
        },
      })
    }

    expect(selectedBuildRun(state)?.diagnostics).toHaveLength(1)
  })

  /// The log-derived set is authoritative and arrives complete, so it replaces
  /// what the live stream guessed rather than being appended to it.
  it("replaces streamed diagnostics with the log-derived set", () => {
    const started: BuildRun = { ...running, id: runId, status: "running" }
    let state = projectBuildReducer(initialProjectBuildState, {
      type: "runStarted",
      run: started,
    })
    state = projectBuildReducer(state, {
      type: "eventReceived",
      event: {
        kind: "log",
        projectPath,
        runId,
        entries: [
          { sequence: 1, timestamp: 1, stream: "stderr", text: "partial" },
        ],
        diagnostics: [
          {
            code: "compilerMessage",
            severity: "error",
            message: "partial",
            raw: "partial",
            context: null,
            occurrences: 1,
            file: null,
            line: null,
            mappingUncertain: true,
            logSequence: 1,
          },
        ],
        progress: null,
      },
    })
    state = projectBuildReducer(state, {
      type: "eventReceived",
      event: {
        kind: "finished",
        projectPath,
        runId,
        status: "failed",
        reason: "The build stopped without writing a PDF.",
        pdfFresh: false,
        finishedAt: 9,
        exitCode: 1,
        diagnostics: [
          {
            code: "missingPackage",
            severity: "error",
            message: "The package algorithm2e isn't installed.",
            raw: "! LaTeX Error: File `algorithm2e.sty' not found.",
            context: null,
            occurrences: 2,
            file: projectRelativePath("main.tex"),
            line: 3,
            mappingUncertain: false,
            logSequence: null,
          },
        ],
      },
    })

    const diagnostics = selectedBuildRun(state)?.diagnostics
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics?.[0]?.code).toBe("missingPackage")
  })
})

it("formats the visible command without changing its arguments", () => {
  expect(formatBuildInvocation(invocation)).toBe(
    'latexmk -pdf "chapter one.tex"'
  )
})
