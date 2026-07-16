import { describe, expect, it } from "vitest"

import type { WorkspaceState } from "@/domain/project"
import { restoreWorkspaceGeometry } from "@/features/projects/workspace-restoration"

const workspace: WorkspaceState = {
  projectPath: "/project",
  pinnedFiles: [],
  selectedRoot: null,
  selectedFile: null,
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

describe("restoreWorkspaceGeometry", () => {
  it("retains valid geometry without showing a notice", () => {
    expect(
      restoreWorkspaceGeometry(workspace, { width: 1440, height: 900 })
    ).toEqual({
      workspace,
      notice: null,
    })
  })

  it("clamps geometry for a smaller window and reports partial restoration", () => {
    const restored = restoreWorkspaceGeometry(
      {
        ...workspace,
        sidebarWidth: 900,
        pdfPaneWidth: 900,
        buildPanelHeight: 700,
      },
      { width: 800, height: 600 }
    )

    expect(restored.workspace.sidebarWidth).toBe(320)
    expect(restored.workspace.pdfPaneWidth).toBe(240)
    expect(restored.workspace.buildPanelHeight).toBe(360)
    expect(restored.notice).toMatch(/adjusted/)
  })

  it("does not reserve PDF space when the pane is closed", () => {
    const restored = restoreWorkspaceGeometry(
      { ...workspace, pdfPaneOpen: false, sidebarWidth: 500 },
      { width: 800, height: 600 }
    )

    expect(restored.workspace.sidebarWidth).toBe(500)
  })
})
