import { describe, expect, it } from "vitest"

import { projectRelativePath } from "@/domain/identifiers"
import {
  classifyEditorChange,
  saveStateAfterWrite,
} from "@/features/editor/editor-change"

const path = projectRelativePath("chapters/input.tex")

describe("classifyEditorChange", () => {
  it("updates presentation state without scheduling persistence mid-composition", () => {
    expect(
      classifyEditorChange("old", null, path, {
        content: "composing",
        composing: true,
      })
    ).toEqual({
      accepted: true,
      contentChanged: true,
      composingDocument: path,
      schedulePersistence: false,
    })
  })

  it("schedules persistence when composition ends without another text delta", () => {
    expect(
      classifyEditorChange("complete", path, path, {
        content: "complete",
        composing: false,
      })
    ).toEqual({
      accepted: true,
      contentChanged: false,
      composingDocument: null,
      schedulePersistence: true,
    })
  })

  it("schedules ordinary document edits", () => {
    expect(
      classifyEditorChange("before", null, path, {
        content: "after",
        composing: false,
      }).schedulePersistence
    ).toBe(true)
  })
})

describe("saveStateAfterWrite", () => {
  it("retains dirty state when the editor advanced during the write", () => {
    expect(saveStateAfterWrite("newer edit", "submitted edit")).toEqual({
      status: "dirty",
    })
  })
})
