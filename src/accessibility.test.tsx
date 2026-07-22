// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NotificationProvider } from "@/components/feedback/notification-provider"
import { initialProjectBuildState } from "@/domain/build"
import type { ProjectSession, StartupState } from "@/domain/project"
import { canonicalProjectPath } from "@/domain/identifiers"
import { BuildPanel } from "@/features/build/build-panel"
import { SourceViewer } from "@/features/projects/source-viewer"
import { WorkspaceToolbar } from "@/features/projects/workspace-toolbar"
import { ProjectSearchPanel } from "@/features/search/project-search-panel"
import { PdfViewer } from "@/features/pdf/pdf-viewer"
import { ProjectHomePage } from "@/pages/project-home-page"
import { SettingsPage } from "@/pages/settings-page"

vi.mock("pdfjs-dist", () => ({
  getDocument: () => {
    throw new Error("PDF loading is outside this accessibility fixture.")
  },
  GlobalWorkerOptions: { workerSrc: "" },
  TextLayerImages: class {},
}))

vi.mock("pdfjs-dist/web/pdf_viewer.mjs", () => ({
  TextLayerBuilder: class {},
}))

const projectPath = canonicalProjectPath("/projects/report")
const callback = vi.fn<(...arguments_: unknown[]) => void>()
const asyncCallback = vi.fn<(...arguments_: unknown[]) => Promise<void>>(() =>
  Promise.resolve()
)
const startup: StartupState = {
  recentProjects: [],
  lastWorkspace: null,
  restorationNotice: null,
}
const session: ProjectSession = {
  project: {
    name: "Report",
    path: projectPath,
    tree: { name: "report", kind: "directory", children: [] },
    rootCandidates: [],
    rootDetectionNote: null,
    persistenceNote: null,
  },
  workspace: {
    projectPath,
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
  },
  documentState: { status: "empty" },
  notice: null,
}

afterEach(() => cleanup())

async function expectNoAutomatedAccessibilityViolations(): Promise<void> {
  const result = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false } },
  })
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ html, target }) => ({ html, target })),
    }))
  ).toEqual([])
}

describe("primary workflow accessibility", () => {
  it("exposes the project entry route with named actions", async () => {
    render(
      <ProjectHomePage
        feedback={{ status: "idle" }}
        onClearFeedback={callback}
        onForgetProject={callback}
        onOpenProject={callback}
        onOpenRecent={callback}
        onOpenSettings={callback}
        startup={startup}
      />
    )

    expect(screen.getByRole("button", { name: /open project/i })).toBeTruthy()
    await expectNoAutomatedAccessibilityViolations()
  })

  it("keeps the workspace build action named", async () => {
    render(<WorkspaceToolbar session={session} />)
    expect(screen.getByText("Report")).toBeTruthy()
    await expectNoAutomatedAccessibilityViolations()
  })

  it("announces empty editor and search states", async () => {
    const { unmount } = render(
      <main>
        <SourceViewer
          fontSize={14}
          initialViewerState={undefined}
          onChange={callback}
          onCursorChange={callback}
          onDiagnosticsChange={callback}
          onOpenReference={callback}
          onResolveConflict={callback}
          onResolveRecovery={callback}
          onSave={callback}
          onViewerStateChange={callback}
          projectPath={projectPath}
          projectTree={session.project.tree}
          retainedPaths={[]}
          state={{ status: "empty" }}
          target={null}
        />
      </main>
    )
    expect(screen.getByText("Select a source file")).toBeTruthy()
    await expectNoAutomatedAccessibilityViolations()
    unmount()

    render(
      <ProjectSearchPanel
        onClose={callback}
        onFilesChanged={callback}
        onNavigate={callback}
        projectPath={projectPath}
      />
    )
    expect(screen.getByRole("textbox", { name: "Search project" })).toBe(
      document.activeElement
    )
    await expectNoAutomatedAccessibilityViolations()
  })

  it("exposes build and empty PDF controls without unnamed actions", async () => {
    const { unmount } = render(
      <NotificationProvider>
        <BuildPanel
          activeDiagnosticIndex={null}
          configurationState={{ status: "loading" }}
          dispatch={callback}
          engine="latexmkPdf"
          logContextSequence={null}
          onBuild={callback}
          onClean={callback}
          onLatexInstalled={callback}
          onNavigate={callback}
          onRevealOutput={callback}
          onSaveConfiguration={asyncCallback}
          onSelectDiagnostic={callback}
          onStartWatch={callback}
          onStop={callback}
          onStopWatch={callback}
          onTabChange={callback}
          profiles={{ status: "loading" }}
          setEngine={callback}
          state={initialProjectBuildState}
          tab="output"
          watch={{ status: "off", message: null }}
        />
      </NotificationProvider>
    )
    expect(screen.getByRole("region", { name: "Build" })).toBeTruthy()
    await expectNoAutomatedAccessibilityViolations()
    unmount()

    render(
      <PdfViewer
        initialState={undefined}
        onClose={callback}
        onNavigateSource={callback}
        onStateChange={callback}
        path={null}
        projectPath={projectPath}
        refreshToken=""
        sourceLocation={null}
      />
    )
    expect(screen.getByRole("region", { name: "PDF viewer" })).toBeTruthy()
    await expectNoAutomatedAccessibilityViolations()
  })

  it("keeps settings controls named and operable", async () => {
    const onSetColorTheme = vi.fn<(theme: string) => void>()
    render(
      <SettingsPage
        accentColor="#2563eb"
        colorTheme="system"
        onClose={callback}
        onSetAccentColor={callback}
        onSetColorTheme={onSetColorTheme}
        onSetEditorFontSize={callback}
        onSetSidebarWidth={callback}
        saveError={null}
        workspace={session.workspace}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: /dark/i }))
    expect(onSetColorTheme).toHaveBeenCalledWith("dark")
    await expectNoAutomatedAccessibilityViolations()
  })
})
