/**
 * The editing behaviour Markdown needs beyond plain text: Enter continues the
 * list or block quote the caret is in, and ends it when the item is empty.
 */

import { Prec } from "@codemirror/state"
import { keymap, type Command, type EditorView } from "@codemirror/view"
import type { Extension } from "@codemirror/state"

import { markdownListItemAt } from "@/domain/markdown"

const continueList: Command = (view: EditorView) => {
  const { state } = view
  if (state.readOnly) return false
  const range = state.selection.main
  if (!range.empty) return false
  const line = state.doc.lineAt(range.head)
  const item = markdownListItemAt(line.text)
  if (item === null) return false
  // With the caret inside the marker itself, Enter is an ordinary line break.
  if (range.head - line.from < item.prefix.length) return false
  if (item.content.trim() === "") {
    // An empty item is one the author has finished, so Enter leaves the list
    // instead of adding another marker below it.
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: { anchor: line.from },
      scrollIntoView: true,
      userEvent: "delete",
    })
    return true
  }
  const insert = `\n${item.next}`
  view.dispatch({
    changes: { from: range.head, to: range.head, insert },
    selection: { anchor: range.head + insert.length },
    scrollIntoView: true,
    userEvent: "input",
  })
  return true
}

/** Takes precedence over the default Enter binding, which only indents. */
export function markdownEditing(): Extension {
  return Prec.high(keymap.of([{ key: "Enter", run: continueList }]))
}
