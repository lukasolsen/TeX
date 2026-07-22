/**
 * Writes the `\end` that belongs to a `\begin` the moment its name is closed.
 *
 * Typing `\begin{itemize}` and getting the matching `\end{itemize}` for free is
 * the single most-used convenience in a LaTeX editor, and it removes the most
 * common structural mistake at the source rather than diagnosing it afterwards.
 *
 * It only fires when the environment is genuinely unclosed, so closing the
 * brace of an existing `\begin` while editing does not insert a second `\end`.
 */

import { EditorView } from "@codemirror/view"
import type { Extension } from "@codemirror/state"

import { parseLatexDocument } from "@/domain/latex-syntax"

export type AutoCloseEdit = Readonly<{
  /** Text inserted after the typed `}`. */
  insert: string
  /** Where the cursor lands, as an offset from the end of the typed `}`. */
  cursor: number
}>

/**
 * The completion for typing `}` at `position` in `source`, or `null` when
 * nothing should be inserted.
 *
 * `source` must already contain the typed `}`, and `position` is the offset
 * just past it.
 */
export function environmentAutoClose(
  source: string,
  position: number
): AutoCloseEdit | null {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1
  const before = source.slice(lineStart, position)
  const opening = /\\begin\{([^{}\\]*)\}$/.exec(before)
  const name = opening?.[1]
  if (opening === null || name === undefined || name.trim() === "") return null

  // The model decides whether this `\begin` is actually unclosed. Re-closing an
  // environment the author already ended would corrupt the document.
  const model = parseLatexDocument(source)
  const beginFrom = position - opening[0].length
  const region = model.regions.find(
    (candidate) =>
      candidate.from === beginFrom &&
      (candidate.kind === "environment" || candidate.kind === "verbatim")
  )
  if (region === undefined || region.closed) return null

  const indent = /^[ \t]*/.exec(source.slice(lineStart, position))?.[0] ?? ""
  const body = `\n${indent}\t`
  return {
    insert: `${body}\n${indent}\\end{${name}}`,
    cursor: body.length,
  }
}

/**
 * Completes an environment as its opening brace is typed.
 *
 * The insertion is one transaction with the typed character, so a single undo
 * removes both and the author is never left with half of it.
 */
export function latexAutoCloseEnvironment(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== "}" || view.state.readOnly) return false
    const typed = view.state.update({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    })
    const source = typed.state.doc.toString()
    const position = from + text.length
    const edit = environmentAutoClose(source, position)
    if (edit === null) return false
    view.dispatch(
      view.state.update({
        changes: [
          { from, to, insert: text },
          { from: to, to, insert: edit.insert },
        ],
        selection: { anchor: position + edit.cursor },
        scrollIntoView: true,
        userEvent: "input.complete",
      })
    )
    return true
  })
}
