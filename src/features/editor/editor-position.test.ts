// @vitest-environment jsdom
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"

import type { EditorViewerState } from "@/domain/project"
import {
  positionOf,
  viewerSelectionPosition,
} from "@/features/editor/editor-position"

const at = (line: number, column: number): EditorViewerState => ({
  line,
  column,
  scrollTop: 0,
  scrollLeft: 0,
})

describe("viewerSelectionPosition", () => {
  const doc = "alpha\nbravo\ncharlie"
  const noViewerState: EditorViewerState | undefined = undefined

  it("defaults to the document start without a viewer state", () => {
    expect(viewerSelectionPosition(doc, noViewerState)).toBe(0)
  })

  it("maps a 1-based line and column to an offset", () => {
    expect(viewerSelectionPosition(doc, at(2, 3))).toBe(8)
  })

  it("clamps a line past the end to the last line", () => {
    expect(viewerSelectionPosition(doc, at(99, 1))).toBe(12)
  })

  it("clamps a column past the line end to the line end", () => {
    expect(viewerSelectionPosition(doc, at(1, 99))).toBe(5)
  })

  it("clamps a line before the start to the first line", () => {
    expect(viewerSelectionPosition(doc, at(0, 1))).toBe(0)
  })
})

describe("positionOf", () => {
  const views: EditorView[] = []
  const viewOf = (doc: string) => {
    const view = new EditorView({ doc })
    views.push(view)
    return view
  }

  afterEach(() => {
    for (const view of views.splice(0)) view.destroy()
  })

  it("reports the 1-based line and column of an offset", () => {
    const view = viewOf("alpha\nbravo\ncharlie")
    expect(positionOf(view, 8)).toEqual({ line: 2, column: 3 })
  })

  it("reports column 1 at the start of a line", () => {
    const view = viewOf("alpha\nbravo")
    expect(positionOf(view, 6)).toEqual({ line: 2, column: 1 })
  })

  it("reports the document start", () => {
    const view = viewOf("alpha")
    expect(positionOf(view, 0)).toEqual({ line: 1, column: 1 })
  })
})
