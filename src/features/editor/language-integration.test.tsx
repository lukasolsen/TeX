// @vitest-environment jsdom

import { CompletionContext } from "@codemirror/autocomplete"
import { toggleComment } from "@codemirror/commands"
import { foldable } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"

import type { EditorLanguageId } from "@/domain/editor-language"
import { projectRelativePath } from "@/domain/identifiers"
import { bibtexCompletionSource } from "@/features/editor/bibtex-completion"
import { editorLanguageSupport } from "@/features/editor/editor-languages"

const views: EditorView[] = []

afterEach(() => {
  // A live view keeps measuring after the test ends.
  for (const view of views.splice(0)) view.destroy()
})

/**
 * The language-facing half of the extension list. Wiring mistakes — a fold
 * service that is never consulted, language data that no longer reaches the
 * comment command, a keymap that never wins — do not show up in unit tests of
 * the pure functions, only here.
 */
function viewOf(language: EditorLanguageId, doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: editorLanguageSupport(language, {
        semantic: {
          sourcePath: projectRelativePath("main.tex"),
          projectFiles: new Set(),
        },
      }),
    }),
  })
  views.push(view)
  return view
}

/** Runs the highest-precedence binding for `key`, the way pressing it does. */
function press(view: EditorView, key: string): boolean {
  const binding = view.state
    .facet(keymap)
    .flat()
    .find((candidate) => candidate.key === key)
  return binding?.run?.(view) ?? false
}

describe("Markdown", () => {
  it("folds a heading's section", () => {
    const view = viewOf("markdown", "# One\ntext\nmore\n# Two")
    const first = view.state.doc.line(1)

    expect(foldable(view.state, first.from, first.to)).toEqual({
      from: first.to,
      to: view.state.doc.line(3).to,
    })
  })

  it("comments a line the way Markdown does", () => {
    const view = viewOf("markdown", "note")
    view.dispatch({ selection: { anchor: 0 } })

    expect(toggleComment(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("<!-- note -->")
  })

  it("continues a list on Enter and ends it on an empty item", () => {
    const view = viewOf("markdown", "- first")
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    expect(press(view, "Enter")).toBe(true)
    expect(view.state.doc.toString()).toBe("- first\n- ")

    expect(press(view, "Enter")).toBe(true)
    expect(view.state.doc.toString()).toBe("- first\n")
  })

  it("leaves Enter alone in ordinary prose", () => {
    const view = viewOf("markdown", "prose")
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    expect(press(view, "Enter")).toBe(false)
  })
})

describe("BibTeX", () => {
  const entry = "@article{k,\n  author = {A},\n  title = {T},\n}"

  it("folds an entry", () => {
    const view = viewOf("bibtex", entry)
    const first = view.state.doc.line(1)

    expect(foldable(view.state, first.from, first.to)).toEqual({
      from: first.to,
      to: view.state.doc.length,
    })
  })

  it("comments a line the way the LaTeX ecosystem does", () => {
    const view = viewOf("bibtex", "author = {A}")
    view.dispatch({ selection: { anchor: 0 } })

    expect(toggleComment(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("% author = {A}")
  })

  it("completes an entry type into a usable entry", async () => {
    const state = EditorState.create({ doc: "@art" })
    const result = await bibtexCompletionSource()(
      new CompletionContext(state, 4, false)
    )

    expect(result?.from).toBe(0)
    const article = result?.options.find(
      (option) => option.label === "@article"
    )
    expect(article?.type).toBe("entry")
    expect(typeof article?.apply).toBe("function")
  })

  it("completes a field and leaves out the ones already written", async () => {
    const doc = "@article{k,\n  author = {A},\n  ti"
    const state = EditorState.create({ doc })
    const result = await bibtexCompletionSource()(
      new CompletionContext(state, doc.length, false)
    )

    const labels = result?.options.map((option) => option.label)
    expect(labels).toContain("title")
    expect(labels).not.toContain("author")
  })
})
