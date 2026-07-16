import { describe, expect, it } from "vitest"

import type { WorkspaceState } from "@/domain/project"
import { canonicalProjectPath, projectRelativePath } from "@/domain/identifiers"
import {
  closeDocument,
  openDocument,
  shouldSaveBeforeOpening,
} from "@/features/projects/document-tabs"

const workspace: WorkspaceState = {
  projectPath: canonicalProjectPath("/projects/thesis"),
  pinnedFiles: [],
  selectedFile: projectRelativePath("main.tex"),
  selectedRoot: projectRelativePath("main.tex"),
  sidebarWidth: 288,
  editorFontSize: 14,
  pdfPaneOpen: true,
  pdfPaneWidth: 480,
  buildPanelOpen: false,
  buildPanelHeight: 240,
  sidebarTab: "files",
  buildPanelTab: "output",
  buildProfile: "latexmkPdf",
  selectedPdf: null,
  pdfViewerStates: {},
  editorViewerStates: {},
}

describe("document tabs", () => {
  it("replaces an unpinned preview and retains pinned documents", () => {
    const pinned = openDocument(workspace, projectRelativePath("main.tex"), true)
    const preview = openDocument(
      pinned,
      projectRelativePath("chapters/intro.tex"),
      false
    )

    expect(preview.pinnedFiles).toEqual(["main.tex"])
    expect(preview.selectedFile).toBe("chapters/intro.tex")
  })

  it("closes the active tab and returns to the latest pinned document", () => {
    const withTabs = {
      ...workspace,
      pinnedFiles: [
        projectRelativePath("main.tex"),
        projectRelativePath("chapters/intro.tex"),
      ],
      selectedFile: projectRelativePath("chapters/intro.tex"),
    }

    expect(
      closeDocument(withTabs, projectRelativePath("chapters/intro.tex"))
    ).toMatchObject({
      pinnedFiles: ["main.tex"],
      selectedFile: "main.tex",
    })
  })

  it("does not require a save when the selected file is reselected", () => {
    expect(shouldSaveBeforeOpening(workspace, projectRelativePath("main.tex"))).toBe(false)
    expect(
      shouldSaveBeforeOpening(workspace, projectRelativePath("chapters/intro.tex"))
    ).toBe(true)
  })
})
