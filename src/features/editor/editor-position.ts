import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

import type { EditorViewerState } from "@/domain/project"
import type { EditorPosition } from "@/features/editor/latex-navigation"
import { clamp } from "@/lib/math"

export function viewerSelectionPosition(
  content: string,
  viewerState: EditorViewerState | undefined
): number {
  const document = EditorState.create({ doc: content }).doc
  const line = document.line(clamp(viewerState?.line ?? 1, 1, document.lines))
  return Math.min(
    line.to,
    line.from + Math.max(0, (viewerState?.column ?? 1) - 1)
  )
}

/** The 1-based line and column of a document position. */
export function positionOf(
  editor: EditorView,
  position: number
): EditorPosition {
  const line = editor.state.doc.lineAt(position)
  return { line: line.number, column: position - line.from + 1 }
}
