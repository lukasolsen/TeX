import { Text } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import type { LatexProjectAnalysis } from "@/domain/latex-analysis"
import { latexDiagnosticsFor } from "@/features/editor/latex-diagnostics-extension"

function analysis(diagnostics: LatexProjectAnalysis["diagnostics"]): {
  analysis: LatexProjectAnalysis
  available: boolean
} {
  return { analysis: { diagnostics, complete: true }, available: true }
}

const noProject = { analysis: null, available: true }

describe("merging the two diagnostic layers", () => {
  it("maps a project span onto document positions", () => {
    const doc = Text.of(["\\documentclass{article}", "\\ref{sec:missing}"])
    const merged = latexDiagnosticsFor(
      doc,
      analysis([
        {
          code: "undefined-label",
          severity: "warning",
          message: "No \\label{sec:missing} is defined in this project.",
          span: { line: 2, column: 6, endLine: 2, endColumn: 17 },
        },
      ])
    )

    expect(merged).toHaveLength(1)
    const diagnostic = merged[0] as NonNullable<(typeof merged)[number]>
    expect(doc.sliceString(diagnostic.from, diagnostic.to)).toBe("sec:missing")
    expect(diagnostic.layer).toBe("project")
  })

  it("maps a span in a line containing astral characters", () => {
    const doc = Text.of(["% 😀 note", "\\ref{a}"])
    // The emoji is two UTF-16 code units, which is how the backend counts.
    const merged = latexDiagnosticsFor(
      doc,
      analysis([
        {
          code: "undefined-label",
          severity: "warning",
          message: "unresolved",
          span: { line: 1, column: 3, endLine: 1, endColumn: 5 },
        },
      ])
    )

    const astralDiagnostic = merged[0] as NonNullable<(typeof merged)[number]>
    expect(doc.sliceString(astralDiagnostic.from, astralDiagnostic.to)).toBe(
      "😀"
    )
  })

  it("keeps document diagnostics when no project analysis has arrived", () => {
    const merged = latexDiagnosticsFor(
      Text.of(["\\begin{itemize}", "\\item a"]),
      noProject
    )

    expect(merged.map((diagnostic) => diagnostic.code)).toEqual([
      "unclosed-environment",
    ])
    expect(merged[0]?.layer).toBe("document")
  })

  it("returns both layers ordered by position", () => {
    const doc = Text.of(["\\ref{missing}", "\\begin{itemize}"])
    const merged = latexDiagnosticsFor(
      doc,
      analysis([
        {
          code: "undefined-label",
          severity: "warning",
          message: "unresolved",
          span: { line: 1, column: 6, endLine: 1, endColumn: 13 },
        },
      ])
    )

    expect(merged.map((diagnostic) => diagnostic.layer)).toEqual([
      "project",
      "document",
    ])
  })

  it("clamps a span that no longer fits the edited document", () => {
    const doc = Text.of(["short"])
    const merged = latexDiagnosticsFor(
      doc,
      analysis([
        {
          code: "missing-file",
          severity: "error",
          message: "stale",
          span: { line: 99, column: 400, endLine: 99, endColumn: 500 },
        },
      ])
    )

    expect(merged[0]?.from).toBeLessThanOrEqual(doc.length)
    expect(merged[0]?.to).toBeLessThanOrEqual(doc.length)
  })
})
