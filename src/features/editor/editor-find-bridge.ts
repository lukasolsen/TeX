import {
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search"
import { EditorView } from "@codemirror/view"

/**
 * Wires the source editor to the find/replace panel, which lives outside the
 * editor and speaks through window CustomEvents. Returns the teardown that
 * removes every listener it registered.
 */
export function installFindBridge(editor: EditorView): () => void {
  const runFind = (event: Event) => {
    if (
      !(event instanceof CustomEvent) ||
      typeof event.detail !== "object" ||
      event.detail === null
    )
      return
    const detail = event.detail
    if (
      typeof detail.query !== "string" ||
      typeof detail.caseSensitive !== "boolean" ||
      typeof detail.wholeWord !== "boolean" ||
      typeof detail.regexp !== "boolean"
    )
      return
    const query = new SearchQuery({
      search: detail.query,
      caseSensitive: detail.caseSensitive,
      wholeWord: detail.wholeWord,
      regexp: detail.regexp,
    })
    editor.dispatch({
      effects: setSearchQuery.of(query),
    })
    let matches = 0
    const cursor = query.getCursor(editor.state)
    for (let match = cursor.next(); !match.done; match = cursor.next()) {
      matches += 1
    }
    window.dispatchEvent(
      new CustomEvent("tex:source-find-status", {
        detail: { matches, valid: query.valid },
      })
    )
    if (query.valid && detail.query !== "") findNext(editor)
  }
  const findPreviousInFile = () => findPrevious(editor)
  const findNextInFile = () => findNext(editor)
  const replaceInFile = (event: Event) => {
    if (!(event instanceof CustomEvent)) return
    const detail = event.detail
    if (
      typeof detail !== "object" ||
      detail === null ||
      typeof detail.query !== "string" ||
      typeof detail.replacement !== "string" ||
      (detail.action !== "next" && detail.action !== "all")
    )
      return
    editor.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: detail.query, replace: detail.replacement })
      ),
    })
    if (detail.action === "next") replaceNext(editor)
    else replaceAll(editor)
  }
  window.addEventListener("tex:source-find", runFind)
  window.addEventListener("tex:source-find-previous", findPreviousInFile)
  window.addEventListener("tex:source-find-next", findNextInFile)
  window.addEventListener("tex:source-replace", replaceInFile)
  return () => {
    window.removeEventListener("tex:source-find", runFind)
    window.removeEventListener("tex:source-find-previous", findPreviousInFile)
    window.removeEventListener("tex:source-find-next", findNextInFile)
    window.removeEventListener("tex:source-replace", replaceInFile)
  }
}
