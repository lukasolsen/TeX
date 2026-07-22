import { describe, expect, it } from "vitest"

import type {
  AsyncDocumentState,
  DocumentSaveState,
  OpenProjectFeedback,
  SourceDocument,
} from "@/domain/project"
import {
  canonicalProjectPath,
  projectRelativePath,
  revisionHash,
} from "@/domain/identifiers"

import { describeOpenFeedback, describeSaveState } from "./workspace-status"

const document: SourceDocument = {
  path: projectRelativePath("main.tex"),
  content: "",
  byteLength: 0,
  revision: { byteLength: 0, contentHash: revisionHash("a".repeat(64)) },
}

function readyState(saveState: DocumentSaveState): AsyncDocumentState {
  return { status: "ready", document, content: "", saveState }
}

describe("describeOpenFeedback", () => {
  it("reports each in-flight and terminal open state", () => {
    expect(describeOpenFeedback({ status: "idle" })).toBeNull()
    expect(describeOpenFeedback({ status: "choosing" })).toBe(
      "Waiting for a folder…"
    )
    expect(
      describeOpenFeedback({
        status: "opening",
        path: canonicalProjectPath("/tmp/project"),
      })
    ).toBe("Opening project…")
    expect(describeOpenFeedback({ status: "cancelled" })).toBe(
      "Folder selection cancelled"
    )
  })

  it("surfaces the error message verbatim", () => {
    const feedback: OpenProjectFeedback = {
      status: "error",
      error: { code: "open-failed", message: "Could not read the folder" },
    }
    expect(describeOpenFeedback(feedback)).toBe("Could not read the folder")
  })
})

describe("describeSaveState", () => {
  it("returns null until an editable document is ready", () => {
    expect(describeSaveState({ status: "empty" })).toBeNull()
    expect(
      describeSaveState({
        status: "loading",
        path: projectRelativePath("a.tex"),
      })
    ).toBeNull()
  })

  it("names every save state of a ready document", () => {
    expect(describeSaveState(readyState({ status: "saved" }))).toBe("Saved")
    expect(describeSaveState(readyState({ status: "dirty" }))).toBe(
      "Unsaved changes"
    )
    expect(describeSaveState(readyState({ status: "saving" }))).toBe("Saving…")
    expect(
      describeSaveState(
        readyState({
          status: "error",
          error: { code: "save-failed", message: "disk full" },
        })
      )
    ).toBe("Save failed · recovery available")
    expect(
      describeSaveState(readyState({ status: "conflict", external: document }))
    ).toBe("External change needs review")
    expect(
      describeSaveState(
        readyState({
          status: "recovery",
          draft: {
            projectPath: canonicalProjectPath("/tmp/project"),
            relativePath: projectRelativePath("main.tex"),
            content: "",
            baseRevision: {
              byteLength: 0,
              contentHash: revisionHash("b".repeat(64)),
            },
            savedAt: 0,
          },
        })
      )
    ).toBe("Recovery draft needs review")
  })
})
