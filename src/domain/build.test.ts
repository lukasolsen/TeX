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

const invocation: BuildInvocation = {
  executable: "latexmk",
  arguments: ["-pdf", "chapter one.tex"],
  workingDirectory: "/project",
  rootFile: "chapter one.tex",
  engine: "latexmkPdf",
}

const running: BuildRun = {
  id: "run-1",
  projectPath: "/project",
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
        projectPath: "/project",
        runId: "run-1",
        entry: { sequence: 1, timestamp: 2, stream: "stderr", text: "error" },
        diagnostic: {
          severity: "error",
          message: "Undefined control sequence",
          file: "main.tex",
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
        projectPath: "/project",
        runId: "run-1",
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
      projectPath: "/project",
      runId: "run-1",
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
})

it("formats the visible command without changing its arguments", () => {
  expect(formatBuildInvocation(invocation)).toBe(
    'latexmk -pdf "chapter one.tex"'
  )
})
