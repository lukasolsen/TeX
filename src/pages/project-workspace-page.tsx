import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactElement } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type {
  EditorViewerState,
  EditorDocumentChange,
  OpenProjectFeedback,
  PdfViewerState,
  ProjectSession,
  WorkspaceFocus,
  WorkspaceViewUpdate,
} from "@/domain/project"
import {
  projectRelativePath,
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import type { HiddenEntryPredicate } from "@/domain/file-visibility"
import type { AppPreferences } from "@/domain/preferences"
import { ProjectSidebar } from "@/features/projects/project-sidebar"
import { SourceViewer } from "@/features/projects/source-viewer"
import { SourceTabs } from "@/features/projects/source-tabs"
import { WorkspaceCommandPalette } from "@/features/commands/workspace-command-palette"
import { ProjectSearchPanel } from "@/features/search/project-search-panel"
import type { EditorTarget } from "@/features/editor/latex-editor"
import { BuildPanel } from "@/features/build/build-panel"
import { BottomPanel } from "@/features/workspace/bottom-panel"
import { ProblemsPanel } from "@/features/workspace/problems-panel"
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import {
  latexSourcePaths,
  reconciledPdf,
} from "@/features/projects/project-model"
import { useProjectBuild } from "@/features/build/use-project-build"
import { useProjectWatch } from "@/features/build/use-project-watch"
import { useProjectTreeWatch } from "@/features/projects/use-project-tree-watch"
import { PdfViewer } from "@/features/pdf/pdf-viewer"
import { CleanAuxiliaryDialog } from "@/features/build/clean-auxiliary-dialog"
import { revealProjectOutput } from "@/services/build-service"
import { projectErrorFromUnknown } from "@/services/project-service"
import { runDetached } from "@/lib/promises"

import { WorkspaceStatusBar } from "./workspace-status-bar"
import { describeOpenFeedback, describeSaveState } from "./workspace-status"
import { useWorkspaceDiagnostics } from "./use-workspace-diagnostics"
import { useWorkspaceShortcuts } from "./use-workspace-shortcuts"

export function ProjectWorkspacePage({
  feedback,
  onOpenProject,
  onOpenPdf,
  onReturnHome,
  onOpenSettings,
  isHidden,
  onResizeSidebar,
  onCloseFile,
  onCloseFiles,
  onCreateProjectEntry,
  onDeleteProjectEntry,
  onEditDocument,
  onPinFile,
  onPreviewFile,
  onRenameProjectEntry,
  onResolveExternalChange,
  onResolveRecovery,
  onProjectFilesChanged,
  onSaveDocument,
  onSetEditorFontSize,
  onSelectRoot,
  preferences,
  onUpdatePdfViewerState,
  onUpdateEditorViewerState,
  onUpdateWorkspaceView,
  restoreFocus,
  restoreFocusToken,
  session,
  shortcutsEnabled,
}: {
  feedback: OpenProjectFeedback
  onOpenProject: () => void
  onOpenPdf: (path: ProjectRelativePath) => void
  onReturnHome: () => void
  onOpenSettings: (focus: WorkspaceFocus) => void
  isHidden: HiddenEntryPredicate
  onResizeSidebar: (width: number, persist: boolean) => void
  onCloseFile: (path: ProjectRelativePath) => void
  onCloseFiles: (paths: ReadonlyArray<ProjectRelativePath>) => void
  onCreateProjectEntry: (
    parentPath: ProjectRelativePath | null,
    name: string,
    directory: boolean
  ) => Promise<boolean>
  onDeleteProjectEntry: (path: ProjectRelativePath) => Promise<void>
  onEditDocument: (
    projectPath: CanonicalProjectPath,
    path: ProjectRelativePath,
    change: EditorDocumentChange
  ) => void
  onPinFile: (path: ProjectRelativePath) => void
  onPreviewFile: (path: ProjectRelativePath) => void
  onRenameProjectEntry: (
    path: ProjectRelativePath,
    name: string
  ) => Promise<boolean>
  onResolveExternalChange: (keepMine: boolean) => void
  onResolveRecovery: (restore: boolean) => void
  onProjectFilesChanged: () => void
  onSaveDocument: () => Promise<boolean>
  preferences: AppPreferences
  /** False while a modal owns the keyboard, such as the settings dialog. */
  shortcutsEnabled: boolean
  onSetEditorFontSize: (fontSize: number) => void
  onSelectRoot: (path: ProjectRelativePath) => void
  onUpdatePdfViewerState: (
    path: ProjectRelativePath,
    state: PdfViewerState
  ) => void
  onUpdateEditorViewerState: (
    path: ProjectRelativePath,
    state: EditorViewerState
  ) => void
  onUpdateWorkspaceView: (update: WorkspaceViewUpdate) => void
  restoreFocus: WorkspaceFocus
  restoreFocusToken: number
  session: ProjectSession
}): ReactElement {
  const selectedFile = session.workspace.selectedFile
  const sidebarWidth = useRef(session.workspace.sidebarWidth)
  const pdfPaneWidth = useRef(session.workspace.pdfPaneWidth)
  const buildPanelHeight = useRef(session.workspace.buildPanelHeight)
  const lastWorkspaceFocus = useRef<WorkspaceFocus>("source")
  const [cleanOpen, setCleanOpen] = useState(false)
  const [buildOperationMessage, setBuildOperationMessage] = useState<
    string | null
  >(null)
  const [sourceProblems, setSourceProblems] = useState<{
    path: ProjectRelativePath
    diagnostics: readonly LatexDiagnosticEntry[]
    complete: boolean
  } | null>(null)
  const [sourceProblemIndex, setSourceProblemIndex] = useState<number | null>(
    null
  )
  const [sourceLocation, setSourceLocation] = useState<{
    path: ProjectRelativePath
    line: number
    column: number
  } | null>(null)
  const [target, setTarget] = useState<
    (EditorTarget & { path: ProjectRelativePath }) | null
  >(null)
  const saveBeforeBuild = preferences.build.saveBeforeBuild
  // With the preference off, a build compiles what is on disk: the save step is
  // skipped rather than being reported as a blocked build.
  const beforeBuild = useCallback(
    () => (saveBeforeBuild ? onSaveDocument() : Promise.resolve(true)),
    [onSaveDocument, saveBeforeBuild]
  )
  const build = useProjectBuild({
    beforeBuild,
    initialEngine: session.workspace.buildProfile,
    onEngineChange: (buildProfile) => onUpdateWorkspaceView({ buildProfile }),
    projectPath: session.project.path,
    rootFile: session.workspace.selectedRoot,
  })
  const buildOpen = session.workspace.buildPanelOpen
  const bottomPanelTab = session.workspace.bottomPanelTab
  const [terminalStarted, setTerminalStarted] = useState(
    () => session.workspace.bottomPanelTab === "terminal"
  )
  const showTerminal = useCallback(() => {
    setTerminalStarted(true)
    onUpdateWorkspaceView({ buildPanelOpen: true, bottomPanelTab: "terminal" })
  }, [onUpdateWorkspaceView])
  const toggleTerminal = useCallback(() => {
    if (buildOpen && bottomPanelTab === "terminal") {
      onUpdateWorkspaceView({ buildPanelOpen: false })
    } else {
      showTerminal()
    }
  }, [buildOpen, bottomPanelTab, onUpdateWorkspaceView, showTerminal])
  const pdfOpen = session.workspace.pdfPaneOpen
  // The workspace is restored before the build configuration is read, so a
  // project that builds into an output directory has no PDF selected until the
  // configured location is known.
  const buildConfiguration =
    build.configurationState.status === "ready"
      ? build.configurationState.configuration
      : null
  const outputDirectory = buildConfiguration?.outputDirectory ?? null
  const selectedPdf = session.workspace.selectedPdf
  const selectedRoot = session.workspace.selectedRoot
  useEffect(() => {
    if (buildConfiguration === null) return
    const reconciled = reconciledPdf(
      session.project,
      selectedPdf,
      selectedRoot,
      outputDirectory
    )
    if (reconciled !== null) onOpenPdf(reconciled)
  }, [
    buildConfiguration,
    onOpenPdf,
    outputDirectory,
    selectedPdf,
    selectedRoot,
    session.project,
  ])
  const rootCandidates = useMemo(
    () => latexSourcePaths(session.project.tree),
    [session.project.tree]
  )
  const latestBuild = build.state.runs[0] ?? null
  const running = build.state.runs.some((run) => run.status === "running")
  // Diagnostics belong to the buffer they were computed from; a tab switch
  // must not show the previous file's problems against the new one.
  const problemsAnalysed =
    sourceProblems !== null && sourceProblems.path === selectedFile
  const activeProblems = problemsAnalysed ? sourceProblems.diagnostics : []
  const activeProblemErrors = activeProblems.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  const watch = useProjectWatch({
    build: build.build,
    buildRunning: running,
    onFilesChanged: onProjectFilesChanged,
    projectPath: session.project.path,
  })
  useProjectTreeWatch({
    onError: setBuildOperationMessage,
    onFilesChanged: onProjectFilesChanged,
    projectPath: session.project.path,
  })
  const profileAvailable =
    build.profiles.status === "ready" &&
    build.profiles.profiles.some(
      (profile) => profile.engine === build.engine && profile.available
    )
  const buildEnabled =
    build.state.preview.status === "ready" &&
    profileAvailable &&
    !running &&
    build.state.action.status !== "pending"
  const activity = describeOpenFeedback(feedback)
  const saveActivity = describeSaveState(session.documentState)

  const {
    diagnostics,
    activeDiagnosticIndex,
    logContextSequence,
    selectDiagnostic,
    moveDiagnostic,
    copyDiagnostic,
    showLogContext,
  } = useWorkspaceDiagnostics({
    buildState: build.state,
    shortcutsEnabled,
    onUpdateWorkspaceView,
    onPinFile,
    onReport: setBuildOperationMessage,
    setTarget,
  })

  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    searchOpen,
    setSearchOpen,
  } = useWorkspaceShortcuts({
    shortcutsEnabled,
    buildEnabled,
    pdfOpen,
    editorFontSize: session.workspace.editorFontSize,
    build,
    onUpdateWorkspaceView,
    onReturnHome,
    onSaveDocument,
    onSetEditorFontSize,
    toggleTerminal,
  })

  const revealOutput = async () => {
    const rootFile =
      build.configurationState.status === "ready"
        ? (build.configurationState.configuration.rootFile ??
          session.workspace.selectedRoot)
        : session.workspace.selectedRoot
    if (rootFile === null) return
    try {
      await revealProjectOutput(
        session.project.path,
        projectRelativePath(rootFile)
      )
      setBuildOperationMessage("Opened the built PDF location")
    } catch (error: unknown) {
      setBuildOperationMessage(projectErrorFromUnknown(error).message)
    }
  }

  // Each failed run is reacted to once. Without this the panel would reopen
  // every time the run list is reconciled, fighting a user who just closed it.
  const failureHandled = useRef<string | null>(null)
  const { openPanelOnFailure, revealProblemsOnFailure } = preferences.build
  useEffect(() => {
    if (latestBuild === null || latestBuild.status !== "failed") return
    if (failureHandled.current === latestBuild.id) return
    failureHandled.current = latestBuild.id
    if (!openPanelOnFailure) return
    onUpdateWorkspaceView({
      buildPanelOpen: true,
      bottomPanelTab: "build",
      buildPanelTab: revealProblemsOnFailure ? "problems" : "output",
    })
  }, [
    latestBuild,
    onUpdateWorkspaceView,
    openPanelOnFailure,
    revealProblemsOnFailure,
  ])

  useEffect(() => {
    if (restoreFocusToken === 0) return
    const frame = window.requestAnimationFrame(() => {
      const region = document.querySelector<HTMLElement>(
        `[data-workspace-focus="${restoreFocus}"]`
      )
      const editor = region?.querySelector<HTMLElement>(".cm-content")
      ;(editor ?? region)?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [restoreFocus, restoreFocusToken])

  return (
    <main
      className="grid h-full min-h-144 grid-rows-[minmax(0,1fr)_1.75rem] overflow-hidden bg-workspace"
      onFocusCapture={(event) => {
        const focus = event.target.closest<HTMLElement>(
          "[data-workspace-focus]"
        )?.dataset["workspaceFocus"]
        if (focus === "source" || focus === "pdf") {
          lastWorkspaceFocus.current = focus
        }
      }}
    >
      <ResizablePanelGroup
        className="min-h-0 min-w-0"
        onLayoutChanged={(_layout, metadata) => {
          if (metadata.isUserInteraction && buildOpen) {
            onUpdateWorkspaceView({
              buildPanelHeight: buildPanelHeight.current,
            })
          }
        }}
        orientation="vertical"
      >
        <ResizablePanel id="workspace" minSize="35%">
          <ResizablePanelGroup
            className="min-h-0 min-w-0"
            onLayoutChanged={(_layout, metadata) => {
              if (metadata.isUserInteraction) {
                onResizeSidebar(sidebarWidth.current, true)
                if (pdfOpen) {
                  onUpdateWorkspaceView({ pdfPaneWidth: pdfPaneWidth.current })
                }
              }
            }}
            orientation="horizontal"
          >
            <ResizablePanel
              defaultSize={session.workspace.sidebarWidth}
              groupResizeBehavior="preserve-pixel-size"
              id="project-tree"
              maxSize="85%"
              minSize={220}
              onResize={(size) => {
                sidebarWidth.current = size.inPixels
              }}
            >
              {searchOpen ? (
                <ProjectSearchPanel
                  onClose={() => setSearchOpen(false)}
                  onFilesChanged={onProjectFilesChanged}
                  onNavigate={(path, line, column) => {
                    const token = Date.now()
                    setTarget({ path, line, column, token })
                    onPinFile(path)
                  }}
                  projectPath={session.project.path}
                />
              ) : (
                <ProjectSidebar
                  isHidden={isHidden}
                  onOpenFileSettings={() =>
                    onOpenSettings(lastWorkspaceFocus.current)
                  }
                  activeLine={
                    sourceLocation?.path === selectedFile
                      ? sourceLocation.line
                      : null
                  }
                  onOpenPdf={(path) => {
                    onUpdateWorkspaceView({ pdfPaneOpen: true })
                    onOpenPdf(path)
                  }}
                  onNavigateOutline={(line) => {
                    if (selectedFile === null) return
                    setTarget({
                      path: selectedFile,
                      line,
                      column: 1,
                      token: Date.now(),
                    })
                  }}
                  onPinFile={onPinFile}
                  onPreviewFile={onPreviewFile}
                  onCreate={onCreateProjectEntry}
                  onRefresh={onProjectFilesChanged}
                  onRename={onRenameProjectEntry}
                  onDelete={onDeleteProjectEntry}
                  documentState={session.documentState}
                  rootFiles={session.project.rootCandidates.map(
                    (candidate) => candidate.path
                  )}
                  selectedFile={selectedFile}
                  selectedPdf={session.workspace.selectedPdf}
                  selectedRoot={session.workspace.selectedRoot}
                  projectName={session.project.name}
                  tree={session.project.tree}
                  tab={session.workspace.sidebarTab}
                  onTabChange={(sidebarTab) =>
                    onUpdateWorkspaceView({ sidebarTab })
                  }
                />
              )}
            </ResizablePanel>
            <ResizableHandle
              aria-label="Resize project files sidebar"
              title="Drag to resize project files sidebar"
              withHandle
            />
            <ResizablePanel id="source-preview" minSize="15%">
              <section
                className="flex size-full min-h-0 min-w-0 flex-col bg-source"
                aria-label="Source preview"
              >
                <SourceTabs
                  documentState={session.documentState}
                  onClose={onCloseFile}
                  onCloseMany={onCloseFiles}
                  onPin={onPinFile}
                  onSelect={onPreviewFile}
                  pinnedFiles={session.workspace.pinnedFiles}
                  projectPath={session.project.path}
                  selectedFile={selectedFile}
                />
                {session.notice !== null ? (
                  <p
                    className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    {session.notice}
                  </p>
                ) : null}
                <SourceViewer
                  fontSize={session.workspace.editorFontSize}
                  preferences={preferences}
                  onChange={(path, change) =>
                    onEditDocument(session.project.path, path, change)
                  }
                  onCursorChange={(path, line, column) =>
                    setSourceLocation({ path, line, column })
                  }
                  onDiagnosticsChange={(
                    path,
                    documentDiagnostics,
                    complete
                  ) => {
                    setSourceProblems({
                      path,
                      diagnostics: documentDiagnostics,
                      complete,
                    })
                    setSourceProblemIndex(null)
                  }}
                  initialViewerState={
                    selectedFile === null
                      ? undefined
                      : session.workspace.editorViewerStates[selectedFile]
                  }
                  onViewerStateChange={onUpdateEditorViewerState}
                  onOpenReference={(path, position) => {
                    onPinFile(path)
                    if (position !== null) {
                      setTarget({ path, ...position, token: Date.now() })
                    }
                  }}
                  onReport={setBuildOperationMessage}
                  onResolveConflict={onResolveExternalChange}
                  onResolveRecovery={onResolveRecovery}
                  onSave={() => runDetached(onSaveDocument())}
                  projectPath={session.project.path}
                  projectTree={session.project.tree}
                  retainedPaths={session.workspace.pinnedFiles}
                  state={session.documentState}
                  target={
                    target !== null && target.path === selectedFile
                      ? target
                      : null
                  }
                />
              </section>
            </ResizablePanel>
            {pdfOpen ? (
              <>
                <ResizableHandle
                  aria-label="Resize PDF viewer"
                  title="Drag to resize PDF viewer"
                  withHandle
                />
                <ResizablePanel
                  defaultSize={session.workspace.pdfPaneWidth}
                  groupResizeBehavior="preserve-pixel-size"
                  id="pdf-viewer"
                  minSize={240}
                  onResize={(size) => {
                    pdfPaneWidth.current = size.inPixels
                  }}
                >
                  <PdfViewer
                    defaults={preferences.pdf}
                    key={session.workspace.selectedPdf ?? "empty-pdf-viewer"}
                    initialState={
                      session.workspace.selectedPdf === null
                        ? undefined
                        : session.workspace.pdfViewerStates[
                            session.workspace.selectedPdf
                          ]
                    }
                    onClose={() =>
                      onUpdateWorkspaceView({ pdfPaneOpen: false })
                    }
                    onStateChange={(viewerState) => {
                      if (session.workspace.selectedPdf !== null) {
                        onUpdatePdfViewerState(
                          session.workspace.selectedPdf,
                          viewerState
                        )
                      }
                    }}
                    onNavigateSource={(path, line, column) => {
                      setTarget({ path, line, column, token: Date.now() })
                      onPinFile(path)
                    }}
                    path={session.workspace.selectedPdf}
                    projectPath={session.project.path}
                    // A failed run that still wrote a PDF is worth showing:
                    // the file exists on disk, and making the reader rebuild
                    // to see work already done helps nobody. The panel says
                    // the build failed; the PDF is simply current.
                    refreshToken={
                      latestBuild?.pdfFresh === true
                        ? `${latestBuild.id}:${latestBuild.finishedAt ?? ""}`
                        : ""
                    }
                    sourceLocation={sourceLocation}
                  />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </ResizablePanel>
        {buildOpen ? (
          <>
            <ResizableHandle
              aria-label="Resize build panel"
              title="Drag to resize build panel"
              withHandle
            />
            <ResizablePanel
              defaultSize={session.workspace.buildPanelHeight}
              groupResizeBehavior="preserve-pixel-size"
              id="build-panel"
              maxSize="60%"
              minSize={160}
              onResize={(size) => {
                buildPanelHeight.current = size.inPixels
              }}
            >
              <BottomPanel
                onClose={() => onUpdateWorkspaceView({ buildPanelOpen: false })}
                onTabChange={(nextTab) => {
                  if (nextTab === "terminal") setTerminalStarted(true)
                  onUpdateWorkspaceView({ bottomPanelTab: nextTab })
                }}
                problemCount={activeProblems.length}
                problemsPanel={
                  <ProblemsPanel
                    analysed={problemsAnalysed}
                    analysisEnabled={preferences.assistance.diagnosticsEnabled}
                    onOpenSettings={() =>
                      onOpenSettings(lastWorkspaceFocus.current)
                    }
                    diagnostics={activeProblems}
                    onNavigate={(line, column) => {
                      if (selectedFile === null) return
                      setTarget({
                        path: selectedFile,
                        line,
                        column,
                        token: Date.now(),
                      })
                    }}
                    onSelect={setSourceProblemIndex}
                    path={selectedFile}
                    projectAnalysisComplete={
                      problemsAnalysed ? sourceProblems.complete : false
                    }
                    selectedIndex={sourceProblemIndex}
                  />
                }
                projectPath={session.project.path}
                tab={bottomPanelTab}
                terminalStarted={terminalStarted}
                buildPanel={
                  <BuildPanel
                    activeDiagnosticIndex={activeDiagnosticIndex}
                    configurationState={build.configurationState}
                    dispatch={build.dispatch}
                    engine={build.engine}
                    logContextSequence={logContextSequence}
                    onBuild={() => runDetached(build.build())}
                    onClean={() => setCleanOpen(true)}
                    onLatexInstalled={build.refreshProfiles}
                    onNavigate={(path, line) => {
                      setTarget({ path, line, column: 1, token: Date.now() })
                      onPinFile(path)
                    }}
                    onRevealOutput={() => runDetached(revealOutput())}
                    onSelectDiagnostic={(index) =>
                      selectDiagnostic(index, false)
                    }
                    onStop={() => runDetached(build.stop())}
                    onStartWatch={() => runDetached(watch.start())}
                    onStopWatch={() => runDetached(watch.stop())}
                    onSaveConfiguration={async (configuration) => {
                      const saved = await build.saveConfiguration(configuration)
                      if (saved.rootFile !== null)
                        onSelectRoot(projectRelativePath(saved.rootFile))
                    }}
                    profiles={build.profiles}
                    setEngine={build.setEngine}
                    state={build.state}
                    tab={session.workspace.buildPanelTab}
                    onTabChange={(buildPanelTab) =>
                      onUpdateWorkspaceView({ buildPanelTab })
                    }
                    queued={build.queued}
                    rootCandidates={rootCandidates}
                    watch={watch.state}
                  />
                }
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>

      <WorkspaceStatusBar
        activity={activity}
        saveActivity={saveActivity}
        buildOperationMessage={buildOperationMessage}
        latestBuild={latestBuild}
        onOpenBuild={() => onUpdateWorkspaceView({ buildPanelOpen: true })}
        onOpenProblems={() =>
          onUpdateWorkspaceView({
            buildPanelOpen: true,
            bottomPanelTab: "problems",
          })
        }
        diagnosticsEnabled={preferences.assistance.diagnosticsEnabled}
        problemsAnalysed={problemsAnalysed}
        problemCount={activeProblems.length}
        errorCount={activeProblemErrors}
        watchState={watch.state}
        onToggleWatch={() =>
          runDetached(watch.active ? watch.stop() : watch.start())
        }
        editorFontSize={session.workspace.editorFontSize}
        sourceLocation={sourceLocation}
        selectedFile={selectedFile}
        project={session.project}
        selectedRoot={session.workspace.selectedRoot}
        onSelectRoot={onSelectRoot}
      />
      <WorkspaceCommandPalette
        buildEnabled={buildEnabled}
        diagnosticsAvailable={diagnostics.length > 0}
        onBuild={() => runDetached(build.build())}
        onBuildAndView={() => {
          onUpdateWorkspaceView({ pdfPaneOpen: true })
          runDetached(build.build())
        }}
        onClean={() => setCleanOpen(true)}
        onCopyDiagnostic={() => runDetached(copyDiagnostic())}
        onFirstDiagnostic={() => selectDiagnostic(0, true)}
        onNextDiagnostic={() => moveDiagnostic(1)}
        onOpenChange={setCommandPaletteOpen}
        onOpenBuild={() => onUpdateWorkspaceView({ buildPanelOpen: true })}
        onOpenFile={onPinFile}
        onOpenProject={onOpenProject}
        onOpenSettings={() => onOpenSettings(lastWorkspaceFocus.current)}
        onPreviousDiagnostic={() => moveDiagnostic(-1)}
        onRevealOutput={() => runDetached(revealOutput())}
        onShowLogContext={showLogContext}
        onTogglePdf={() => onUpdateWorkspaceView({ pdfPaneOpen: !pdfOpen })}
        onToggleTerminal={toggleTerminal}
        onSave={() => runDetached(onSaveDocument())}
        onSearch={() => setSearchOpen(true)}
        onToggleWatch={() =>
          runDetached(watch.active ? watch.stop() : watch.start())
        }
        onZoomIn={() =>
          onSetEditorFontSize(session.workspace.editorFontSize + 1)
        }
        onZoomOut={() =>
          onSetEditorFontSize(session.workspace.editorFontSize - 1)
        }
        open={commandPaletteOpen}
        pdfOpen={pdfOpen}
        watchActive={watch.active}
        tree={session.project.tree}
      />
      {cleanOpen ? (
        <CleanAuxiliaryDialog
          onOpenChange={setCleanOpen}
          open
          projectPath={session.project.path}
        />
      ) : null}
    </main>
  )
}
