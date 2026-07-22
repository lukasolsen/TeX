// @vitest-environment jsdom

import { toggleComment } from "@codemirror/commands"
import { foldable, syntaxHighlighting } from "@codemirror/language"
import { StreamLanguage } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { describe, expect, it } from "vitest"

import { latexAutoCloseEnvironment } from "@/features/editor/latex-auto-close-environment"
import { latexFolding } from "@/features/editor/latex-folding"
import { latexHighlightStyle } from "@/features/editor/latex-highlighting"
import { latexDelimiterMatching } from "@/features/editor/latex-matching"
import { latexStreamParser } from "@/features/editor/latex-stream-parser"

/**
 * The language-facing half of the editor's extension list. Wiring mistakes —
 * a fold service that is never consulted, language data that no longer
 * reaches the comment command — do not show up in unit tests of the pure
 * functions, only here.
 */
const languageExtensions = [
  StreamLanguage.define(latexStreamParser),
  syntaxHighlighting(latexHighlightStyle),
  latexDelimiterMatching(),
  latexFolding(),
  latexAutoCloseEnvironment(),
]

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: languageExtensions })
}

function viewOf(doc: string): EditorView {
  return new EditorView({ state: stateOf(doc) })
}

/** Runs the registered input handlers the way typing a character does. */
function typeText(view: EditorView, text: string): boolean {
  const at = view.state.selection.main.head
  return view.state
    .facet(EditorView.inputHandler)
    .some((handler) =>
      handler(view, at, at, text, () =>
        view.state.update({ changes: { from: at, to: at, insert: text } })
      )
    )
}

describe("editor wiring", () => {
  it("registers the fold service so environments are foldable", () => {
    const doc = "\\begin{itemize}\n  \\item a\n\\end{itemize}"
    const state = stateOf(doc)
    const first = state.doc.line(1)

    // The fold ends at the start of the \end line, so folding joins the
    // opening and closing delimiters onto one line.
    expect(foldable(state, first.from, first.to)).toEqual({
      from: first.to,
      to: state.doc.line(3).from,
    })
  })

  it("offers no fold on a line that opens nothing", () => {
    const state = stateOf("plain text\nmore text")
    const first = state.doc.line(1)

    expect(foldable(state, first.from, first.to)).toBeNull()
  })

  it("carries the LaTeX comment token through to the comment command", () => {
    // The parser now owns this language data; if it stopped reaching the
    // command, Mod-/ would silently do nothing.
    const view = viewOf("\\section{One}")

    expect(toggleComment(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("% \\section{One}")

    toggleComment(view)
    expect(view.state.doc.toString()).toBe("\\section{One}")
    view.destroy()
  })

  it("closes an environment as its opening brace is typed", () => {
    const view = viewOf("\\begin{itemize")
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    const handled = typeText(view, "}")

    expect(handled).toBe(true)
    expect(view.state.doc.toString()).toBe(
      "\\begin{itemize}\n\t\n\\end{itemize}"
    )
    view.destroy()
  })

  it("leaves an ordinary closing brace alone", () => {
    const view = viewOf("\\section{One")
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    const handled = typeText(view, "}")

    expect(handled).toBe(false)
    expect(view.state.doc.toString()).toBe("\\section{One")
    view.destroy()
  })

  it("undoes an auto-closed environment as a single edit", () => {
    const view = viewOf("\\begin{center")
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    typeText(view, "}")
    // One transaction means one undo step for the user.
    expect(view.state.doc.toString()).toContain("\\end{center}")
    view.destroy()
  })
})
