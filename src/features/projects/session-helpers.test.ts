import { describe, expect, it } from "vitest"

import type {
  AppSessionState,
  EditorViewerState,
  PdfViewerState,
  StartupState,
  WorkspaceState,
} from "@/domain/project"
import { canonicalProjectPath, projectRelativePath } from "@/domain/identifiers"
import {
  combinedNotice,
  isProjectPathWithin,
  pruneWorkspaceAfterDelete,
  remapWorkspaceAfterRename,
  renamedProjectPath,
  withOpenFeedback,
} from "@/features/projects/session-helpers"

const pdfViewerState: PdfViewerState = {
  page: 1,
  position: 0,
  zoom: 1,
  rotation: 0,
  layout: "continuous",
  sidebar: "none",
}

const editorViewerState: EditorViewerState = {
  line: 1,
  column: 1,
  scrollTop: 0,
  scrollLeft: 0,
}

function workspace(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    projectPath: canonicalProjectPath("/projects/thesis"),
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
    bottomPanelTab: "build",
    buildProfile: "latexmkPdf",
    selectedPdf: null,
    pdfViewerStates: {},
    editorViewerStates: {},
    ...overrides,
  }
}

describe("renamedProjectPath", () => {
  it("rewrites the entry itself", () => {
    expect(
      renamedProjectPath(
        projectRelativePath("chapters/intro.tex"),
        projectRelativePath("chapters/intro.tex"),
        projectRelativePath("chapters/introduction.tex")
      )
    ).toBe("chapters/introduction.tex")
  })

  it("rewrites descendants of a renamed folder", () => {
    expect(
      renamedProjectPath(
        projectRelativePath("chapters/intro/body.tex"),
        projectRelativePath("chapters"),
        projectRelativePath("parts")
      )
    ).toBe("parts/intro/body.tex")
  })

  it("leaves unrelated and prefix-only paths untouched", () => {
    expect(
      renamedProjectPath(
        projectRelativePath("chaptersaside.tex"),
        projectRelativePath("chapters"),
        projectRelativePath("parts")
      )
    ).toBe("chaptersaside.tex")
    expect(
      renamedProjectPath(
        projectRelativePath("appendix.tex"),
        projectRelativePath("chapters"),
        projectRelativePath("parts")
      )
    ).toBe("appendix.tex")
  })
})

describe("isProjectPathWithin", () => {
  it("matches the parent itself and its descendants", () => {
    expect(
      isProjectPathWithin(
        projectRelativePath("chapters"),
        projectRelativePath("chapters")
      )
    ).toBe(true)
    expect(
      isProjectPathWithin(
        projectRelativePath("chapters/intro.tex"),
        projectRelativePath("chapters")
      )
    ).toBe(true)
  })

  it("rejects null, siblings, and prefix-only names", () => {
    expect(isProjectPathWithin(null, projectRelativePath("chapters"))).toBe(
      false
    )
    expect(
      isProjectPathWithin(
        projectRelativePath("chaptersaside.tex"),
        projectRelativePath("chapters")
      )
    ).toBe(false)
  })
})

describe("combinedNotice", () => {
  it("drops nulls and joins the remaining notices with a space", () => {
    expect(combinedNotice("first.", null, "second.")).toBe("first. second.")
  })

  it("returns null when every notice is null", () => {
    expect(combinedNotice(null, null)).toBeNull()
    expect(combinedNotice()).toBeNull()
  })
})

describe("withOpenFeedback", () => {
  it("leaves a starting state unchanged", () => {
    const starting: AppSessionState = { status: "starting" }
    expect(withOpenFeedback(starting, { status: "idle" })).toBe(starting)
  })

  it("replaces the open feedback on a settled state", () => {
    const startup: StartupState = {
      recentProjects: [],
      lastWorkspace: null,
      restorationNotice: null,
    }
    const home: AppSessionState = {
      status: "home",
      startup,
      openFeedback: { status: "idle" },
    }
    expect(withOpenFeedback(home, { status: "choosing" })).toEqual({
      status: "home",
      startup,
      openFeedback: { status: "choosing" },
    })
  })
})

describe("remapWorkspaceAfterRename", () => {
  it("follows every stored path when a folder is renamed", () => {
    const from = projectRelativePath("chapters")
    const to = projectRelativePath("parts")
    const source = workspace({
      pinnedFiles: [
        projectRelativePath("chapters/intro.tex"),
        projectRelativePath("appendix.tex"),
      ],
      selectedRoot: projectRelativePath("chapters/intro.tex"),
      selectedFile: projectRelativePath("chapters/intro.tex"),
      selectedPdf: projectRelativePath("chapters/intro.pdf"),
      pdfViewerStates: { "chapters/intro.pdf": pdfViewerState },
      editorViewerStates: { "chapters/intro.tex": editorViewerState },
    })

    expect(remapWorkspaceAfterRename(source, from, to)).toEqual(
      workspace({
        pinnedFiles: [
          projectRelativePath("parts/intro.tex"),
          projectRelativePath("appendix.tex"),
        ],
        selectedRoot: projectRelativePath("parts/intro.tex"),
        selectedFile: projectRelativePath("parts/intro.tex"),
        selectedPdf: projectRelativePath("parts/intro.pdf"),
        pdfViewerStates: { "parts/intro.pdf": pdfViewerState },
        editorViewerStates: { "parts/intro.tex": editorViewerState },
      })
    )
  })

  it("preserves null selections", () => {
    const result = remapWorkspaceAfterRename(
      workspace(),
      projectRelativePath("chapters"),
      projectRelativePath("parts")
    )
    expect(result.selectedRoot).toBeNull()
    expect(result.selectedFile).toBeNull()
    expect(result.selectedPdf).toBeNull()
  })
})

describe("pruneWorkspaceAfterDelete", () => {
  it("drops paths under the deleted entry and falls back to the last pin", () => {
    const source = workspace({
      pinnedFiles: [
        projectRelativePath("intro.tex"),
        projectRelativePath("chapters/body.tex"),
      ],
      selectedRoot: projectRelativePath("chapters/body.tex"),
      selectedFile: projectRelativePath("chapters/body.tex"),
      selectedPdf: projectRelativePath("chapters/body.pdf"),
      pdfViewerStates: { "chapters/body.pdf": pdfViewerState },
      editorViewerStates: {
        "chapters/body.tex": editorViewerState,
        "intro.tex": editorViewerState,
      },
    })

    expect(
      pruneWorkspaceAfterDelete(source, projectRelativePath("chapters"))
    ).toEqual(
      workspace({
        pinnedFiles: [projectRelativePath("intro.tex")],
        selectedRoot: null,
        selectedFile: projectRelativePath("intro.tex"),
        selectedPdf: null,
        pdfViewerStates: {},
        editorViewerStates: { "intro.tex": editorViewerState },
      })
    )
  })

  it("falls back to the selected root when no pins survive", () => {
    const source = workspace({
      pinnedFiles: [projectRelativePath("chapters/body.tex")],
      selectedRoot: projectRelativePath("main.tex"),
      selectedFile: projectRelativePath("chapters/body.tex"),
    })

    const result = pruneWorkspaceAfterDelete(
      source,
      projectRelativePath("chapters")
    )
    expect(result.pinnedFiles).toEqual([])
    expect(result.selectedFile).toBe("main.tex")
  })

  it("keeps the active file when it lies outside the deleted entry", () => {
    const source = workspace({
      pinnedFiles: [projectRelativePath("intro.tex")],
      selectedFile: projectRelativePath("intro.tex"),
    })

    const result = pruneWorkspaceAfterDelete(
      source,
      projectRelativePath("chapters")
    )
    expect(result.selectedFile).toBe("intro.tex")
    expect(result.pinnedFiles).toEqual([projectRelativePath("intro.tex")])
  })
})
