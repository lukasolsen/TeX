/**
 * Wires both diagnostic layers into the editor.
 *
 * The document layer runs in the lint source itself: it is a pure function of
 * the buffer, so it never waits on anything. The project layer runs in a
 * debounced view plugin that stores its last result in editor state; the lint
 * source reads that stored result rather than awaiting it, so a slow or failing
 * project analysis can never delay or suppress a structural diagnostic the
 * editor already knows about.
 */

import { forceLinting, linter, type Diagnostic } from "@codemirror/lint"
import { StateEffect, StateField, type Extension } from "@codemirror/state"
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"
import type { Text } from "@codemirror/state"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import type { LatexProjectAnalysis, LatexSpan } from "@/domain/latex-analysis"
import {
  documentDiagnostics,
  type LatexDiagnostic,
  type LatexDiagnosticEntry,
} from "@/domain/latex-diagnostics"
import { requestLatexProjectAnalysis } from "@/services/latex-analysis-service"

/**
 * How long the editor waits after the last keystroke before analysing. Long
 * enough that ordinary typing never triggers a project scan, short enough that
 * a pause feels answered.
 */
const PROJECT_ANALYSIS_DELAY = 400
const LINT_DELAY = 350

export type LatexDiagnosticsContext = Readonly<{
  projectPath: () => CanonicalProjectPath
  relativePath: () => ProjectRelativePath
  /** Receives the merged, position-resolved set whenever it is recomputed. */
  onDiagnosticsChange: (
    diagnostics: readonly LatexDiagnosticEntry[],
    complete: boolean
  ) => void
}>

type ProjectState = Readonly<{
  analysis: LatexProjectAnalysis | null
  /** False once an analysis attempt failed, so the panel can say so. */
  available: boolean
}>

const setProjectAnalysis = StateEffect.define<ProjectState>()

const projectAnalysisField = StateField.define<ProjectState>({
  create: () => ({ analysis: null, available: true }),
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setProjectAnalysis)) return effect.value
    }
    return value
  },
})

/** Maps a 1-based line and UTF-16 column span onto document positions. */
function spanRange(doc: Text, span: LatexSpan): { from: number; to: number } {
  const startLine = doc.line(Math.min(Math.max(span.line, 1), doc.lines))
  const from = Math.min(startLine.to, startLine.from + span.column - 1)
  const endLine = doc.line(Math.min(Math.max(span.endLine, 1), doc.lines))
  const to = Math.min(endLine.to, endLine.from + span.endColumn - 1)
  return { from, to: Math.max(from, to) }
}

/** The merged document and project diagnostics for the current buffer. */
export function latexDiagnosticsFor(
  doc: Text,
  project: ProjectState
): LatexDiagnostic[] {
  const source = doc.toString()
  const merged: LatexDiagnostic[] = documentDiagnostics(source)
  for (const diagnostic of project.analysis?.diagnostics ?? []) {
    const { from, to } = spanRange(doc, diagnostic.span)
    merged.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      from,
      to,
      layer: "project",
    })
  }
  return merged.toSorted(
    (left, right) => left.from - right.from || left.to - right.to
  )
}

function toEditorDiagnostic(diagnostic: LatexDiagnostic): Diagnostic {
  return {
    from: diagnostic.from,
    // A zero-width range draws nothing, so an end-of-document problem still
    // needs a character to underline.
    to: Math.max(diagnostic.to, diagnostic.from + 1),
    severity: diagnostic.severity,
    source: diagnostic.layer === "project" ? "Project" : "Document",
    message: diagnostic.message,
  }
}

function analysisPlugin(context: LatexDiagnosticsContext) {
  return ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | null = null
      private sequence = 0

      constructor(view: EditorView) {
        this.schedule(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.schedule(update.view)
      }

      destroy() {
        if (this.timer !== null) clearTimeout(this.timer)
        // Outstanding responses are discarded rather than applied to a view
        // that no longer shows this document.
        this.sequence += 1
      }

      private schedule(view: EditorView) {
        if (this.timer !== null) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          this.timer = null
          void this.run(view)
        }, PROJECT_ANALYSIS_DELAY)
      }

      private async run(view: EditorView) {
        this.sequence += 1
        const token = this.sequence
        const relativePath = context.relativePath()
        let next: ProjectState
        try {
          next = {
            analysis: await requestLatexProjectAnalysis({
              projectPath: context.projectPath(),
              relativePath,
              content: view.state.doc.toString(),
            }),
            available: true,
          }
        } catch {
          // A failed analysis withdraws project findings rather than leaving
          // stale ones on screen, and says so through `available`.
          next = { analysis: null, available: false }
        }
        if (
          token !== this.sequence ||
          relativePath !== context.relativePath()
        ) {
          return
        }
        view.dispatch({ effects: setProjectAnalysis.of(next) })
        forceLinting(view)
      }
    }
  )
}

/**
 * Diagnostics for the active buffer, combining what one file can decide with
 * what the project can decide.
 */
export function latexDiagnostics(context: LatexDiagnosticsContext): Extension {
  return [
    projectAnalysisField,
    analysisPlugin(context),
    linter(
      (view) => {
        const project = view.state.field(projectAnalysisField)
        const merged = latexDiagnosticsFor(view.state.doc, project)
        const entries = merged.map((diagnostic) => {
          const line = view.state.doc.lineAt(diagnostic.from)
          return {
            ...diagnostic,
            line: line.number,
            column: diagnostic.from - line.from + 1,
          }
        })
        queueMicrotask(() =>
          context.onDiagnosticsChange(
            entries,
            project.available && (project.analysis?.complete ?? false)
          )
        )
        return merged.map((diagnostic) => toEditorDiagnostic(diagnostic))
      },
      { delay: LINT_DELAY }
    ),
  ]
}
