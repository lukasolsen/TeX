import { describe, expect, it } from "vitest"

import {
  formatBuildInvocation,
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
  bibliographyTool: "automatic",
  custom: false,
}

const running: BuildRun = {
  id: runId,
  projectPath,
  invocation,
  status: "running",
  startedAt: 1,
  finishedAt: null,
  exitCode: null,
  entries: [],
  diagnostics: [],
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
        entry: { sequence: 1, timestamp: 2, stream: "stderr", text: "error" },
        diagnostic: {
          severity: "error",
          message: "Undefined control sequence",
          file: projectRelativePath("main.tex"),
          line: 4,
          mappingUncertain: false,
          logSequence: 1,
        },
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
        finishedAt: 3,
        exitCode: 1,
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
      entry: { sequence: 1, timestamp: 2, stream: "stdout", text: "fast" },
      diagnostic: null,
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
      finishedAt: 4,
      exitCode: 0,
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
          entry: {
            sequence,
            timestamp: sequence,
            stream: "stdout",
            text: "line",
          },
          diagnostic: null,
        },
      })
    }
    expect(selectedBuildRun(runningState)?.entries).toHaveLength(500)
    expect(selectedBuildRun(runningState)?.entries[0]?.sequence).toBe(101)

    let pendingState = initialProjectBuildState
    for (let sequence = 1; sequence <= 600; sequence += 1) {
      pendingState = projectBuildReducer(pendingState, {
        type: "eventReceived",
        event: {
          kind: "finished",
          projectPath,
          runId: buildId(`2-${sequence}`),
          status: "failed",
          finishedAt: sequence,
          exitCode: 1,
        },
      })
    }
    expect(pendingState.pendingEvents).toHaveLength(512)
  })
})

it("formats the visible command without changing its arguments", () => {
  expect(formatBuildInvocation(invocation)).toBe(
    'latexmk -pdf "chapter one.tex"'
  )
})
