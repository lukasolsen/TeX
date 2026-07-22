import { describe, expect, it } from "vitest"

import {
  diagnosticSummary,
  replaysCachedFailure,
  runLabel,
  statusLabel,
  watchLabel,
} from "@/features/build/build-panel-model"
import type { BuildRun } from "@/domain/build"
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
    bibliographyTool: "automatic",
    custom: false,
  },
  status: "succeeded",
  startedAt: 1,
  finishedAt: 2,
  exitCode: 0,
  entries: [],
  diagnostics: [],
}

describe("build panel model", () => {
  it("maps each build status to a stable label", () => {
    expect(statusLabel("running")).toBe("Building")
    expect(statusLabel("succeeded")).toBe("Succeeded")
    expect(statusLabel("failed")).toBe("Failed")
    expect(statusLabel("cancelled")).toBe("Cancelled")
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
            severity: "error",
            message: "boom",
            file: null,
            line: null,
            mappingUncertain: false,
            logSequence: 1,
          },
          {
            severity: "warning",
            message: "careful",
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
