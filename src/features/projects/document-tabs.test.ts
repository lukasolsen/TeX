import { describe, expect, it } from "vitest"

import type { WorkspaceState } from "@/domain/project"
import {
  closeDocument,
  openDocument,
  shouldSaveBeforeOpening,
} from "@/features/projects/document-tabs"

const workspace: WorkspaceState = {
  projectPath: "/projects/thesis",
  pinnedFiles: [],
  selectedFile: "main.tex",
  selectedRoot: "main.tex",
  sidebarWidth: 288,
  editorFontSize: 14,
}

describe("document tabs", () => {
  it("replaces an unpinned preview and retains pinned documents", () => {
    const pinned = openDocument(workspace, "main.tex", true)
    const preview = openDocument(pinned, "chapters/intro.tex", false)

    expect(preview.pinnedFiles).toEqual(["main.tex"])
    expect(preview.selectedFile).toBe("chapters/intro.tex")
  })

  it("closes the active tab and returns to the latest pinned document", () => {
    const withTabs = {
      ...workspace,
      pinnedFiles: ["main.tex", "chapters/intro.tex"],
      selectedFile: "chapters/intro.tex",
    }

    expect(closeDocument(withTabs, "chapters/intro.tex")).toMatchObject({
      pinnedFiles: ["main.tex"],
      selectedFile: "main.tex",
    })
  })

  it("does not require a save when the selected file is reselected", () => {
    expect(shouldSaveBeforeOpening(workspace, "main.tex")).toBe(false)
    expect(shouldSaveBeforeOpening(workspace, "chapters/intro.tex")).toBe(true)
  })
})
