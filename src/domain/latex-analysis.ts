/**
 * The IPC contract for project-wide LaTeX analysis.
 *
 * Spans arrive as line and UTF-16 column rather than byte offsets, because the
 * backend indexes bytes and the editor indexes UTF-16 code units. Converting at
 * the boundary keeps a document containing non-ASCII text correct on both
 * sides; the editor maps a span onto a position with its own document.
 */

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import { projectRelativePath } from "@/domain/identifiers"
import type {
  LatexDiagnosticCode,
  LatexDiagnosticSeverity,
} from "@/domain/latex-diagnostics"
import {
  arrayValue,
  booleanValue,
  enumValue,
  integer,
  nonEmptyString,
  record,
  stringValue,
} from "@/services/ipc-contract"

const MAX_LINE = 4_000_000
const MAX_COLUMN = 2_000_000

export type LatexSpan = Readonly<{
  /** 1-based line. */
  line: number
  /** 1-based column in UTF-16 code units. */
  column: number
  endLine: number
  endColumn: number
}>

export type LatexProjectDiagnostic = Readonly<{
  code: LatexDiagnosticCode
  severity: LatexDiagnosticSeverity
  message: string
  span: LatexSpan
}>

export type LatexProjectAnalysis = Readonly<{
  diagnostics: ReadonlyArray<LatexProjectDiagnostic>
  /** False when the project scan was partial, so absence of a finding is not proof. */
  complete: boolean
}>

export type LatexSymbolKind = "label" | "citation" | "file"

export type LatexSymbolLocation = Readonly<{
  path: ProjectRelativePath
  span: LatexSpan
  /** The trimmed source line, for a result list the user can read. */
  preview: string
}>

export type LatexSymbolInfo = Readonly<{
  name: string
  kind: LatexSymbolKind
  definitions: ReadonlyArray<LatexSymbolLocation>
  references: ReadonlyArray<LatexSymbolLocation>
}>

export type LatexAnalysisRequest = Readonly<{
  projectPath: CanonicalProjectPath
  relativePath: ProjectRelativePath
  content: string
}>

export type LatexSymbolRequest = LatexAnalysisRequest &
  Readonly<{ line: number; column: number }>

const DIAGNOSTIC_CODES: readonly LatexDiagnosticCode[] = [
  "duplicate-label",
  "duplicate-citation",
  "undefined-label",
  "undefined-citation",
  "missing-file",
]

function parseSpan(
  value: Record<string, unknown>,
  contract: string
): LatexSpan {
  const line = integer(value.line, `${contract} line`, 1, MAX_LINE)
  const column = integer(value.column, `${contract} column`, 1, MAX_COLUMN)
  return {
    line,
    column,
    endLine: integer(value.endLine, `${contract} end line`, line, MAX_LINE),
    endColumn: integer(
      value.endColumn,
      `${contract} end column`,
      1,
      MAX_COLUMN
    ),
  }
}

export function parseLatexProjectAnalysis(
  value: unknown
): LatexProjectAnalysis {
  const input = record(value, "LaTeX analysis response")
  return {
    complete: booleanValue(input.complete, "LaTeX analysis completeness"),
    diagnostics: arrayValue(
      input.diagnostics,
      "LaTeX analysis diagnostics",
      500,
      (item) => {
        const diagnostic = record(item, "LaTeX analysis diagnostic")
        return {
          code: enumValue(
            diagnostic.code,
            "LaTeX analysis diagnostic code",
            DIAGNOSTIC_CODES
          ),
          severity: enumValue(
            diagnostic.severity,
            "LaTeX analysis diagnostic severity",
            ["error", "warning"] as const
          ),
          message: nonEmptyString(
            diagnostic.message,
            "LaTeX analysis diagnostic message",
            2_048
          ),
          span: parseSpan(diagnostic, "LaTeX analysis diagnostic"),
        }
      }
    ),
  }
}

function parseLocation(value: unknown): LatexSymbolLocation {
  const location = record(value, "LaTeX symbol location")
  return {
    path: projectRelativePath(
      nonEmptyString(location.path, "LaTeX symbol location path", 4_096)
    ),
    span: parseSpan(location, "LaTeX symbol location"),
    preview: stringValue(
      location.preview,
      "LaTeX symbol location preview",
      512
    ),
  }
}

export function parseLatexSymbolInfo(value: unknown): LatexSymbolInfo | null {
  const input = record(value, "LaTeX symbol response")
  if (input.symbol === null || input.symbol === undefined) return null
  const symbol = record(input.symbol, "LaTeX symbol")
  return {
    name: nonEmptyString(symbol.name, "LaTeX symbol name", 1_024),
    kind: enumValue(symbol.kind, "LaTeX symbol kind", [
      "label",
      "citation",
      "file",
    ] as const),
    definitions: arrayValue(
      symbol.definitions,
      "LaTeX symbol definitions",
      500,
      parseLocation
    ),
    references: arrayValue(
      symbol.references,
      "LaTeX symbol references",
      500,
      parseLocation
    ),
  }
}
