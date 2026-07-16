import { useEffect, useRef, useState } from "react"
import { FileText, Hammer, LockKeyhole, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type {
  EditorViewerState,
  OpenProjectFeedback,
  PdfViewerState,
  ProjectSession,
  WorkspaceFocus,
  WorkspaceState,
} from "@/domain/project"
import { ProjectSidebar } from "@/features/projects/project-sidebar"
import { RootFileControl } from "@/features/projects/root-file-control"
import { SourceViewer } from "@/features/projects/source-viewer"
import { SourceTabs } from "@/features/projects/source-tabs"
import { WorkspaceToolbar } from "@/features/projects/workspace-toolbar"
import { WorkspaceCommandPalette } from "@/features/commands/workspace-command-palette"
import { ProjectSearchPanel } from "@/features/search/project-search-panel"
import type { EditorTarget } from "@/features/editor/latex-editor"
import { BuildPanel } from "@/features/build/build-panel"
import { useProjectBuild } from "@/features/build/use-project-build"
import { useProjectWatch } from "@/features/build/use-project-watch"
import { PdfViewer } from "@/features/pdf/pdf-viewer"

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
  onOpenPdf: (path: string) => void
  onReturnHome: () => void
  onOpenSettings: (focus: WorkspaceFocus) => void
  onResizeSidebar: (width: number, persist: boolean) => void
  onCloseFile: (path: string) => void
  onCloseFiles: (paths: string[]) => void
  onCreateProjectEntry: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onDeleteProjectEntry: (path: string) => Promise<void>
  onEditDocument: (path: string, content: string) => void
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onRenameProjectEntry: (path: string, name: string) => Promise<void>
  onResolveExternalChange: (keepMine: boolean) => void
  onResolveRecovery: (restore: boolean) => void
  onProjectFilesChanged: () => void
  onSaveDocument: () => Promise<boolean>
  onSetEditorFontSize: (fontSize: number) => void
  onSelectRoot: (path: string) => void
  onUpdatePdfViewerState: (path: string, state: PdfViewerState) => void
  onUpdateEditorViewerState: (path: string, state: EditorViewerState) => void
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
        | "buildProfile"
      >
    >
  ) => void
  restoreFocus: WorkspaceFocus
  restoreFocusToken: number
  session: ProjectSession
}) {
  const selectedFile = session.workspace.selectedFile
  const sidebarWidth = useRef(session.workspace.sidebarWidth)
  const pdfPaneWidth = useRef(session.workspace.pdfPaneWidth)
  const buildPanelHeight = useRef(session.workspace.buildPanelHeight)
  const lastWorkspaceFocus = useRef<WorkspaceFocus>("source")
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sourceLocation, setSourceLocation] = useState<{
    path: string
    line: number
    column: number
  } | null>(null)
  const [target, setTarget] = useState<
    (EditorTarget & { path: string }) | null
  >(null)
  const build = useProjectBuild({
    beforeBuild: onSaveDocument,
    initialEngine: session.workspace.buildProfile,
    onEngineChange: (buildProfile) => onUpdateWorkspaceView({ buildProfile }),
    projectPath: session.project.path,
    rootFile: session.workspace.selectedRoot,
  })
  const buildOpen = session.workspace.buildPanelOpen
  const pdfOpen = session.workspace.pdfPaneOpen
  const latestBuild = build.state.runs[0] ?? null
  const running = build.state.runs.some((run) => run.status === "running")
  const watch = useProjectWatch({
    build: build.build,
    buildRunning: running,
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
      className="grid h-svh min-h-144 grid-rows-[3.25rem_minmax(0,1fr)_1.75rem] overflow-hidden bg-workspace"
      onFocusCapture={(event) => {
        const focus = event.target.closest<HTMLElement>(
          "[data-workspace-focus]"
        )?.dataset.workspaceFocus
        if (focus === "source" || focus === "pdf") {
          lastWorkspaceFocus.current = focus
        }
      }}
    >
      <WorkspaceToolbar
        buildEnabled={buildEnabled}
        buildStatus={latestBuild?.status ?? null}
        feedback={feedback}
        onBuild={() => void build.build()}
        onOpenProject={onOpenProject}
        onOpenCommands={() => setCommandPaletteOpen(true)}
        onOpenBuild={() => onUpdateWorkspaceView({ buildPanelOpen: true })}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => onOpenSettings(lastWorkspaceFocus.current)}
        onTogglePdf={() => onUpdateWorkspaceView({ pdfPaneOpen: !pdfOpen })}
        onReturnHome={onReturnHome}
        onSave={onSaveDocument}
        onStop={() => void build.stop()}
        pdfOpen={pdfOpen}
        session={session}
      />

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
                  onChange={onEditDocument}
                  onCursorChange={(path, line, column) =>
                    setSourceLocation({ path, line, column })
                  }
                  initialViewerState={
                    selectedFile === null
                      ? undefined
                      : session.workspace.editorViewerStates[selectedFile]
                  }
                  onViewerStateChange={onUpdateEditorViewerState}
                  onOpenReference={onPinFile}
                  onResolveConflict={onResolveExternalChange}
                  onResolveRecovery={onResolveRecovery}
                  onSave={onSaveDocument}
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
              <BuildPanel
                configurationState={build.configurationState}
                dispatch={build.dispatch}
                engine={build.engine}
                onBuild={() => void build.build()}
                onClose={() => onUpdateWorkspaceView({ buildPanelOpen: false })}
                onNavigate={(path, line) => {
                  setTarget({ path, line, column: 1, token: Date.now() })
                  onPinFile(path)
                }}
                onStop={() => void build.stop()}
                onStartWatch={() => void watch.start()}
                onStopWatch={() => void watch.stop()}
                onSaveConfiguration={async (configuration) => {
                  const saved = await build.saveConfiguration(configuration)
                  if (saved.rootFile !== null) onSelectRoot(saved.rootFile)
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
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>

      <footer className="flex min-w-0 items-center gap-1 border-t bg-status px-2 text-[11px] text-status-foreground">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
          Local project
        </span>
        {activity !== null ? (
          <span className="truncate rounded px-2 py-0.5" role="status">
            {activity}
          </span>
        ) : null}
        {saveActivity !== null ? (
          <span className="truncate" role="status">
            {saveActivity}
          </span>
        ) : null}
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
          onClick={() => void (watch.active ? watch.stop() : watch.start())}
          size="xs"
          variant="ghost"
        >
          {watch.state.status === "off"
            ? "Watch off"
            : watch.state.status === "error"
              ? "Watch error"
              : `Watch ${watch.state.status}`}
        </Button>
        <span className="ml-auto hidden items-center gap-1.5 text-status-foreground/75 md:flex">
          <FileText aria-hidden="true" className="size-3.5" />
          {session.workspace.editorFontSize}px
        </span>
        {sourceLocation?.path === selectedFile ? (
          <span className="hidden items-center gap-1.5 text-status-foreground/75 sm:flex">
            <MapPin aria-hidden="true" className="size-3.5" />
            Ln {sourceLocation.line}, Col {sourceLocation.column}
          </span>
        ) : null}
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
        onBuild={() => void build.build()}
        onOpenChange={setCommandPaletteOpen}
        onOpenBuild={() => onUpdateWorkspaceView({ buildPanelOpen: true })}
        onOpenFile={onPinFile}
        onOpenProject={onOpenProject}
        onOpenSettings={() => onOpenSettings(lastWorkspaceFocus.current)}
        onTogglePdf={() => onUpdateWorkspaceView({ pdfPaneOpen: !pdfOpen })}
        onSave={onSaveDocument}
        onSearch={() => setSearchOpen(true)}
        onToggleWatch={() => void (watch.active ? watch.stop() : watch.start())}
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
    </main>
  )
}
