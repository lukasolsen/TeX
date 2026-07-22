import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactElement } from "react"
import {
  CircleAlert,
  FileText,
  Hammer,
  ListChecks,
  LockKeyhole,
  MapPin,
} from "lucide-react"

import { Button } from "@/components/ui/button"
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
  WorkspaceState,
} from "@/domain/project"
import {
  projectRelativePath,
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import { ProjectSidebar } from "@/features/projects/project-sidebar"
import { RootFileControl } from "@/features/projects/root-file-control"
import { SourceViewer } from "@/features/projects/source-viewer"
import { SourceTabs } from "@/features/projects/source-tabs"
import { WorkspaceCommandPalette } from "@/features/commands/workspace-command-palette"
import { ProjectSearchPanel } from "@/features/search/project-search-panel"
import type { EditorTarget } from "@/features/editor/latex-editor"
import { BuildPanel } from "@/features/build/build-panel"
import { BottomPanel } from "@/features/workspace/bottom-panel"
import { ProblemsPanel } from "@/features/workspace/problems-panel"
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import { useProjectBuild } from "@/features/build/use-project-build"
import { useProjectWatch } from "@/features/build/use-project-watch"
import { useProjectTreeWatch } from "@/features/projects/use-project-tree-watch"
import { PdfViewer } from "@/features/pdf/pdf-viewer"
import { CleanAuxiliaryDialog } from "@/features/build/clean-auxiliary-dialog"
import { selectedBuildRun, type BuildDiagnostic } from "@/domain/build"
import { revealProjectOutput } from "@/services/build-service"
import { projectErrorFromUnknown } from "@/services/project-service"
import { runDetached } from "@/lib/promises"

export function ProjectWorkspacePage({
  feedback,
  onOpenProject,
  onOpenPdf,
  onReturnHome,
  onOpenSettings,
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
  onUpdatePdfViewerState,
  onUpdateEditorViewerState,
  onUpdateWorkspaceView,
  restoreFocus,
  restoreFocusToken,
  session,
}: {
  feedback: OpenProjectFeedback
  onOpenProject: () => void
  onOpenPdf: (path: ProjectRelativePath) => void
  onReturnHome: () => void
  onOpenSettings: (focus: WorkspaceFocus) => void
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
  onUpdateWorkspaceView: (
    update: Partial<
      Pick<
        WorkspaceState,
        | "pdfPaneOpen"
        | "pdfPaneWidth"
        | "buildPanelOpen"
        | "buildPanelHeight"
        | "sidebarTab"
        | "buildPanelTab"
        | "bottomPanelTab"
        | "buildProfile"
      >
    >
  ) => void
  restoreFocus: WorkspaceFocus
  restoreFocusToken: number
  session: ProjectSession
}): ReactElement {
  const selectedFile = session.workspace.selectedFile
  const sidebarWidth = useRef(session.workspace.sidebarWidth)
  const pdfPaneWidth = useRef(session.workspace.pdfPaneWidth)
  const buildPanelHeight = useRef(session.workspace.buildPanelHeight)
  const lastWorkspaceFocus = useRef<WorkspaceFocus>("source")
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [cleanOpen, setCleanOpen] = useState(false)
  const [diagnosticCursor, setDiagnosticCursor] = useState(0)
  const [logContextSequence, setLogContextSequence] = useState<number | null>(
    null
  )
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
  const build = useProjectBuild({
    beforeBuild: onSaveDocument,
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
  const latestBuild = build.state.runs[0] ?? null
  const running = build.state.runs.some((run) => run.status === "running")
  const diagnosticRun = selectedBuildRun(build.state)
  const diagnostics = diagnosticRun?.diagnostics ?? []
  const activeDiagnosticIndex =
    diagnostics.length === 0
      ? null
      : Math.min(diagnosticCursor, diagnostics.length - 1)
  const activeDiagnostic =
    activeDiagnosticIndex === null
      ? null
      : (diagnostics[activeDiagnosticIndex] ?? null)
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
  const activity =
    feedback.status === "choosing"
      ? "Waiting for a folder…"
      : feedback.status === "opening"
        ? "Opening project…"
        : feedback.status === "cancelled"
          ? "Folder selection cancelled"
          : feedback.status === "error"
            ? feedback.error.message
            : null
  const saveActivity =
    session.documentState.status !== "ready"
      ? null
      : session.documentState.saveState.status === "saved"
        ? "Saved"
        : session.documentState.saveState.status === "dirty"
          ? "Unsaved changes"
          : session.documentState.saveState.status === "saving"
            ? "Saving…"
            : session.documentState.saveState.status === "error"
              ? "Save failed · recovery available"
              : session.documentState.saveState.status === "conflict"
                ? "External change needs review"
                : "Recovery draft needs review"

  const selectDiagnostic = (index: number, navigate: boolean) => {
    const diagnostic = diagnostics[index]
    if (diagnostic === undefined) return
    setDiagnosticCursor(index)
    onUpdateWorkspaceView({
      buildPanelOpen: true,
      buildPanelTab: "problems",
    })
    if (
      navigate &&
      diagnostic.file !== null &&
      diagnostic.line !== null &&
      !diagnostic.mappingUncertain
    ) {
      setTarget({
        path: diagnostic.file,
        line: diagnostic.line,
        column: 1,
        token: Date.now(),
      })
      onPinFile(diagnostic.file)
    }
  }

  const moveDiagnostic = (offset: number) => {
    if (diagnostics.length === 0) return
    const current = activeDiagnosticIndex ?? 0
    const next = (current + offset + diagnostics.length) % diagnostics.length
    selectDiagnostic(next, true)
  }

  const copyDiagnostic = async () => {
    const diagnostic = activeDiagnostic ?? diagnostics[0]
    if (diagnostic === undefined) return
    try {
      await navigator.clipboard.writeText(formatDiagnostic(diagnostic))
      setBuildOperationMessage("Diagnostic copied")
    } catch {
      setBuildOperationMessage("Could not copy the diagnostic")
    }
  }

  const showLogContext = () => {
    const diagnostic = activeDiagnostic ?? diagnostics[0]
    if (diagnostic === undefined) return
    setDiagnosticCursor(Math.max(0, diagnostics.indexOf(diagnostic)))
    setLogContextSequence(diagnostic.logSequence)
    onUpdateWorkspaceView({ buildPanelOpen: true, buildPanelTab: "output" })
  }

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

  useEffect(() => {
    const openCommandPalette = () => setCommandPaletteOpen(true)
    window.addEventListener("tex:open-command-palette", openCommandPalette)
    return () =>
      window.removeEventListener("tex:open-command-palette", openCommandPalette)
  }, [])

  useEffect(() => {
    const runWorkspaceAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      switch (event.detail) {
        case "build":
          if (buildEnabled) runDetached(build.build())
          break
        case "build-details":
          onUpdateWorkspaceView({ buildPanelOpen: true })
          break
        case "find-source":
          window.dispatchEvent(new Event("tex:open-source-find"))
          break
        case "project-home":
          onReturnHome()
          break
        case "save":
          runDetached(onSaveDocument())
          break
        case "search-project":
          setSearchOpen(true)
          break
        case "toggle-pdf":
          onUpdateWorkspaceView({ pdfPaneOpen: !pdfOpen })
          break
      }
    }
    window.addEventListener("tex:workspace-action", runWorkspaceAction)
    return () =>
      window.removeEventListener("tex:workspace-action", runWorkspaceAction)
  }, [
    build,
    buildEnabled,
    onReturnHome,
    onSaveDocument,
    onUpdateWorkspaceView,
    pdfOpen,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault()
        setCommandPaletteOpen(true)
      } else if (
        modifier &&
        event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault()
        onUpdateWorkspaceView({ buildPanelOpen: true })
      } else if (
        modifier &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault()
        setSearchOpen(true)
      } else if (
        modifier &&
        !event.shiftKey &&
        event.key.toLowerCase() === "j"
      ) {
        event.preventDefault()
        toggleTerminal()
      } else if (modifier && (event.key === "+" || event.key === "=")) {
        event.preventDefault()
        onSetEditorFontSize(session.workspace.editorFontSize + 1)
      } else if (modifier && event.key === "-") {
        event.preventDefault()
        onSetEditorFontSize(session.workspace.editorFontSize - 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    onSetEditorFontSize,
    onUpdateWorkspaceView,
    session.workspace.editorFontSize,
    toggleTerminal,
  ])

  useEffect(() => {
    const onDiagnosticKey = (event: KeyboardEvent) => {
      if (event.key !== "F8") return
      event.preventDefault()
      moveDiagnostic(event.shiftKey ? -1 : 1)
    }
    window.addEventListener("keydown", onDiagnosticKey)
    return () => window.removeEventListener("keydown", onDiagnosticKey)
  })

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
        )?.dataset.workspaceFocus
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
                  onChange={(path, change) =>
                    onEditDocument(session.project.path, path, change)
                  }
                  onCursorChange={(path, line, column) =>
                    setSourceLocation({ path, line, column })
                  }
                  onDiagnosticsChange={(path, diagnostics, complete) => {
                    setSourceProblems({ path, diagnostics, complete })
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
                    refreshToken={
                      latestBuild?.status === "succeeded"
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
                    watch={watch.state}
                  />
                }
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>

      <footer className="flex min-w-0 items-center gap-2 border-t bg-status px-2 text-meta text-status-foreground">
        <span className="flex shrink-0 items-center gap-1.5">
          <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
          Local project
        </span>
        {activity === null &&
        saveActivity === null &&
        buildOperationMessage === null ? null : (
          <>
            <StatusDivider />
            <span className="flex min-w-0 items-center gap-2">
              {activity !== null ? (
                <span className="truncate" role="status">
                  {activity}
                </span>
              ) : null}
              {saveActivity !== null ? (
                <span className="truncate" role="status">
                  {saveActivity}
                </span>
              ) : null}
              {buildOperationMessage !== null ? (
                <span className="truncate" role="status">
                  {buildOperationMessage}
                </span>
              ) : null}
            </span>
          </>
        )}
        <StatusDivider />
        <Button
          className="text-status-foreground hover:bg-status-foreground/10 hover:text-status-foreground"
          onClick={() => onUpdateWorkspaceView({ buildPanelOpen: true })}
          size="xs"
          variant="ghost"
        >
          <Hammer data-icon="inline-start" />
          {latestBuild === null
            ? "Build ready"
            : latestBuild.status === "running"
              ? "Building"
              : `Build ${latestBuild.status}`}
        </Button>
        <Button
          className="text-status-foreground hover:bg-status-foreground/10 hover:text-status-foreground"
          onClick={() =>
            onUpdateWorkspaceView({
              buildPanelOpen: true,
              bottomPanelTab: "problems",
            })
          }
          size="xs"
          variant="ghost"
        >
          {activeProblemErrors > 0 ? (
            <CircleAlert data-icon="inline-start" />
          ) : (
            <ListChecks data-icon="inline-start" />
          )}
          {!problemsAnalysed
            ? "Problems"
            : activeProblems.length === 0
              ? "No problems"
              : `${activeProblems.length} ${activeProblems.length === 1 ? "problem" : "problems"}`}
        </Button>
        <Button
          className="text-status-foreground hover:bg-status-foreground/10 hover:text-status-foreground"
          onClick={() =>
            runDetached(watch.active ? watch.stop() : watch.start())
          }
          size="xs"
          variant="ghost"
        >
          {watch.state.status === "off"
            ? "Watch off"
            : watch.state.status === "error"
              ? "Watch error"
              : `Watch ${watch.state.status}`}
        </Button>
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-status-foreground/75 md:flex">
          <FileText aria-hidden="true" className="size-3.5" />
          {session.workspace.editorFontSize}px
        </span>
        {sourceLocation?.path === selectedFile ? (
          <span className="hidden shrink-0 items-center gap-1.5 text-status-foreground/75 sm:flex">
            <MapPin aria-hidden="true" className="size-3.5" />
            Ln {sourceLocation.line}, Col {sourceLocation.column}
          </span>
        ) : null}
        <StatusDivider />
        <span className="min-w-0">
          <RootFileControl
            onSelectRoot={onSelectRoot}
            project={session.project}
            selectedRoot={session.workspace.selectedRoot}
          />
        </span>
      </footer>
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

/** Separates the status bar's groups so they do not read as one run-on line. */
function StatusDivider(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-px shrink-0 bg-status-foreground/20"
    />
  )
}

function formatDiagnostic(diagnostic: BuildDiagnostic): string {
  const location =
    diagnostic.file === null
      ? ""
      : `${diagnostic.file}${diagnostic.line === null ? "" : `:${diagnostic.line}`}: `
  return `${location}${diagnostic.severity.toUpperCase()}: ${diagnostic.message}`
}
