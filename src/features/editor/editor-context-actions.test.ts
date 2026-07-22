import { describe, expect, it } from "vitest"

import { editorContextActions } from "@/features/editor/editor-context-actions"

const plain = {
  navigable: false,
  hasSelection: false,
  foldable: false,
  folded: false,
  readOnly: false,
}

function ids(state: Partial<typeof plain> = {}) {
  return editorContextActions({ ...plain, ...state }).map((action) => action.id)
}

describe("editor context actions", () => {
  it("always offers the actions that always apply", () => {
    expect(ids()).toEqual([
      "paste",
      "toggle-comment",
      "find-in-file",
      "select-all",
    ])
  })

  it("offers going to a definition only on a reference", () => {
    expect(ids({ navigable: true })).toContain("go-to-definition")
    expect(ids()).not.toContain("go-to-definition")
  })

  it("leads with the navigation action when it applies", () => {
    expect(ids({ navigable: true })[0]).toBe("go-to-definition")
  })

  it("offers cut and copy only with a selection", () => {
    expect(ids({ hasSelection: true })).toContain("copy")
    expect(ids({ hasSelection: true })).toContain("cut")
    expect(ids()).not.toContain("copy")
    expect(ids()).not.toContain("cut")
  })

  it("offers folding or unfolding, never both", () => {
    expect(ids({ foldable: true })).toContain("fold")
    expect(ids({ foldable: true })).not.toContain("unfold")
    expect(ids({ foldable: true, folded: true })).toContain("unfold")
    expect(ids({ foldable: true, folded: true })).not.toContain("fold")
    expect(ids()).not.toContain("fold")
  })

  it("withholds every editing action while the document is read-only", () => {
    const readOnly = ids({ readOnly: true, hasSelection: true, foldable: true })

    expect(readOnly).not.toContain("cut")
    expect(readOnly).not.toContain("paste")
    expect(readOnly).not.toContain("toggle-comment")
    // Reading the document is still possible, so these remain.
    expect(readOnly).toContain("copy")
    expect(readOnly).toContain("fold")
    expect(readOnly).toContain("select-all")
  })

  it("names a shortcut only where one exists", () => {
    const actions = editorContextActions({ ...plain, navigable: true })
    const byId = new Map(actions.map((action) => [action.id, action]))

    expect(byId.get("go-to-definition")?.shortcut).toEqual(["primary", "enter"])
    expect(byId.get("select-all")?.shortcut).toBeNull()
  })

  it("keeps groups contiguous so separators land between them", () => {
    const groups = editorContextActions({
      ...plain,
      navigable: true,
      hasSelection: true,
      foldable: true,
    }).map((action) => action.group)

    expect(groups).toEqual([...groups].sort((a, b) => a - b))
    expect(new Set(groups).size).toBe(4)
  })
})
