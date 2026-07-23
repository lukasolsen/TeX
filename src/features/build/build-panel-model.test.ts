import { describe, expect, it } from "vitest"

import {
  diagnosticSummary,
  elapsedLabel,
  isFailedStatus,
  progressLabel,
  replaysCachedFailure,
  runLabel,
  statusLabel,
  watchLabel,
} from "@/features/build/build-panel-model"
import { initialBuildProgress, type BuildRun } from "@/domain/build"
import {
  buildId,
  canonicalProjectPath,
  projectRelativePath,
} from "@/domain/identifiers"

const projectPath = canonicalProjectPath("/project")

const baseRun: BuildRun = {
  id: buildId("1-1"),
  projectPath,
  invocation: {
    executable: "latexmk",
    arguments: ["-pdf", "main.tex"],
    workingDirectory: projectPath,
    rootFile: projectRelativePath("main.tex"),
    engine: "latexmkPdf",
    environment: [],
    bibliography: "automatic",
    resolvesReferences: true,
    custom: false,
  },
  status: "succeeded",
  reason: null,
  pdfFresh: false,
  startedAt: 1,
  finishedAt: 2,
  exitCode: 0,
  entries: [],
  diagnostics: [],
  progress: initialBuildProgress,
}

describe("build panel model", () => {
  it("maps each build status to a stable label", () => {
    expect(statusLabel("running")).toBe("Building")
    expect(statusLabel("succeeded")).toBe("Succeeded")
    expect(statusLabel("failed")).toBe("Failed")
    expect(statusLabel("cancelled")).toBe("Stopped")
    // A run that produced a PDF and reported problems is not a failure, and
    // a timeout is not an unexplained one.
    expect(statusLabel("succeededWithProblems")).toBe("Built with problems")
    expect(statusLabel("timedOut")).toBe("Timed out")
    expect(isFailedStatus("succeededWithProblems")).toBe(false)
    expect(isFailedStatus("timedOut")).toBe(true)
    expect(isFailedStatus("cancelled")).toBe(false)
  })

  it("summarizes diagnostics with singular and plural counts", () => {
    expect(diagnosticSummary({ ...baseRun, diagnostics: [] })).toBe(
      "0 errors, 0 warnings"
    )
    expect(
      diagnosticSummary({
        ...baseRun,
        diagnostics: [
          {
            code: "compilerMessage",
            severity: "error",
            message: "boom",
            raw: "boom",
            context: null,
            occurrences: 1,
            file: null,
            line: null,
            mappingUncertain: false,
            logSequence: 1,
          },
          {
            code: "compilerMessage",
            severity: "warning",
            message: "careful",
            raw: "careful",
            context: null,
            occurrences: 1,
            file: null,
            line: null,
            mappingUncertain: false,
            logSequence: 2,
          },
        ],
      })
    ).toBe("1 error, 1 warning")
  })

  it("suppresses the watch label while actively watching but names other states", () => {
    expect(watchLabel({ status: "off", message: null })).toBeNull()
    expect(watchLabel({ status: "watching", message: null })).toBeNull()
    expect(watchLabel({ status: "starting", message: null })).toBe(
      "watch starting"
    )
    expect(watchLabel({ status: "building", message: null })).toBe(
      "watch building"
    )
    expect(watchLabel({ status: "error", message: null })).toBe("watch error")
    expect(watchLabel({ status: "pausedUnsafe", message: null })).toBe(
      "watch paused"
    )
  })

  it("labels the latest run distinctly from earlier runs", () => {
    expect(runLabel(baseRun, 0)).toBe("Latest · Succeeded")
    expect(runLabel({ ...baseRun, status: "failed" }, 2)).toContain("· Failed")
  })

  it("detects a latexmk replay of a previous failure", () => {
    expect(replaysCachedFailure(null)).toBe(false)
    expect(replaysCachedFailure(baseRun)).toBe(false)
    expect(
      replaysCachedFailure({
        ...baseRun,
        status: "failed",
        entries: [
          {
            sequence: 1,
            timestamp: 1,
            stream: "stdout",
            text: "Latexmk: main.tex gave an error in previous invocation of latexmk",
          },
        ],
      })
    ).toBe(true)
  })
})

describe("progress and elapsed time", () => {
  /// An indefinite spinner is not evidence of work, and the engine already
  /// says which pass it is on and how many pages it has shipped.
  it("reports the pass and page count of a running build", () => {
    const running: BuildRun = {
      ...baseRun,
      status: "running",
      finishedAt: null,
      progress: { pass: 2, tool: "pdflatex", pages: 12, summary: null },
    }

    expect(progressLabel(running)).toBe("pass 2 · pdflatex · 12 pages")
  })

  it("says nothing before the engine has reported anything", () => {
    expect(
      progressLabel({ ...baseRun, status: "running", finishedAt: null })
    ).toBeNull()
  })

  /// A finished run does not advertise progress; it advertises its outcome.
  it("reports no progress for a finished run", () => {
    expect(progressLabel({ ...baseRun, status: "succeeded" })).toBeNull()
  })

  /// Whole seconds cannot tell a fast build from a slow one. Milliseconds can.
  it("renders sub-second build durations", () => {
    const run: BuildRun = { ...baseRun, startedAt: 1_000, finishedAt: 3_400 }

    expect(elapsedLabel(run, 9_999)).toBe("2.4 s")
    expect(
      elapsedLabel({ ...run, finishedAt: null, status: "running" }, 1_450)
    ).toBe("450 ms")
  })
})
