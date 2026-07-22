/**
 * The diagnostic vocabulary shared by both analysis layers, and the document
 * layer itself.
 *
 * The document layer runs in the editor on every change and sees only the
 * active buffer, so it answers exactly the questions a single file can answer
 * on its own: is the structure balanced, and is a label defined twice here. The
 * project layer in `src-tauri/src/latex_analysis.rs` answers everything that
 * needs the whole project and emits the same shape, so one list feeds the
 * gutter, the underlines, and the Problems panel.
 */

import {
  parseLatexDocument,
  type LatexDocumentModel,
} from "@/domain/latex-syntax"

export type LatexDiagnosticSeverity = "error" | "warning"

export type LatexDiagnosticCode =
  | "unclosed-environment"
  | "unopened-environment"
  | "mismatched-environment"
  | "unclosed-math"
  | "unclosed-group"
  | "duplicate-label"
  | "duplicate-citation"
  | "undefined-label"
  | "undefined-citation"
  | "missing-file"

/** Which layer produced a diagnostic, so a refreshed layer replaces only its own. */
export type LatexDiagnosticLayer = "document" | "project"

export type LatexDiagnostic = Readonly<{
  code: LatexDiagnosticCode
  severity: LatexDiagnosticSeverity
  /** A sentence naming what is wrong and what would resolve it. */
  message: string
  from: number
  to: number
  layer: LatexDiagnosticLayer
}>

/**
 * Only the first unclosed brace is reported. LaTeX sources legitimately contain
 * constructs whose braces this scanner cannot pair, and a cascade of derived
 * complaints from one real mistake teaches users to ignore the gutter.
 */
const MAX_UNCLOSED_GROUPS = 1

/** The 1-based line number of `position`, from a prepared line-start index. */
function lineNumber(lineStarts: readonly number[], position: number): number {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if ((lineStarts[middle] ?? 0) <= position) low = middle
    else high = middle - 1
  }
  return low + 1
}

function lineStartIndex(source: string): number[] {
  const starts = [0]
  for (let index = source.indexOf("\n"); index !== -1;) {
    starts.push(index + 1)
    index = source.indexOf("\n", index + 1)
  }
  return starts
}

function mathCloser(delimiter: string): string {
  if (delimiter === "\\(") return "\\)"
  if (delimiter === "\\[") return "\\]"
  return delimiter
}

/**
 * Diagnostics decidable from one buffer: structural balance, and a label the
 * file defines more than once.
 *
 * Anything that depends on symbols defined elsewhere is deliberately absent —
 * a `\ref` whose `\label` lives in another chapter is correct, and reporting it
 * here would be a false positive on every multi-file project.
 */
export function documentDiagnostics(
  source: string,
  model: LatexDocumentModel = parseLatexDocument(source)
): LatexDiagnostic[] {
  const diagnostics: LatexDiagnostic[] = []
  const lineStarts = lineStartIndex(source)
  let unclosedGroups = 0

  for (const problem of model.problems) {
    switch (problem.kind) {
      case "unclosed-environment":
        diagnostics.push({
          code: problem.kind,
          severity: "error",
          message: `\\begin{${problem.name}} is never closed. Add \\end{${problem.name}}.`,
          from: problem.from,
          to: problem.to,
          layer: "document",
        })
        break
      case "unopened-environment":
        diagnostics.push({
          code: problem.kind,
          severity: "error",
          message: `\\end{${problem.name}} has no matching \\begin{${problem.name}}.`,
          from: problem.from,
          to: problem.to,
          layer: "document",
        })
        break
      case "mismatched-environment":
        diagnostics.push({
          code: problem.kind,
          severity: "error",
          message: `\\begin{${problem.name}} is closed by a different environment. Add \\end{${problem.name}} before it.`,
          from: problem.from,
          to: problem.to,
          layer: "document",
        })
        break
      case "unclosed-math":
        diagnostics.push({
          code: problem.kind,
          severity: "error",
          message: `Math opened with ${problem.name} is never closed. Add ${mathCloser(problem.name)}.`,
          from: problem.from,
          to: problem.to,
          layer: "document",
        })
        break
      case "unclosed-group":
        if (unclosedGroups >= MAX_UNCLOSED_GROUPS) break
        unclosedGroups += 1
        diagnostics.push({
          code: problem.kind,
          severity: "warning",
          message: "This { is never closed. Add a matching }.",
          from: problem.from,
          to: problem.to,
          layer: "document",
        })
        break
    }
  }

  const definedAt = new Map<string, number>()
  for (const occurrence of model.occurrences) {
    if (occurrence.role !== "label-definition") continue
    const first = definedAt.get(occurrence.name)
    if (first === undefined) {
      definedAt.set(occurrence.name, occurrence.from)
      continue
    }
    diagnostics.push({
      code: "duplicate-label",
      severity: "warning",
      message: `\\label{${occurrence.name}} is already defined on line ${lineNumber(lineStarts, first)}. References to it resolve to only one of the two.`,
      from: occurrence.from,
      to: occurrence.to,
      layer: "document",
    })
  }

  return diagnostics.sort(
    (left, right) => left.from - right.from || left.to - right.to
  )
}
