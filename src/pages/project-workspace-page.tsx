import { useEffect, useRef, useState } from "react"
import { Hammer, LockKeyhole } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { OpenProjectFeedback, ProjectSession } from "@/domain/project"
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

export function ProjectWorkspacePage({
  feedback,
  onOpenProject,
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
  session,
}: {
  feedback: OpenProjectFeedback
  onOpenProject: () => void
  onReturnHome: () => void
  onOpenSettings: () => void
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
  session: ProjectSession
}) {
  const selectedFile = session.workspace.selectedFile
  const sidebarWidth = useRef(session.workspace.sidebarWidth)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [buildOpen, setBuildOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [target, setTarget] = useState<
    (EditorTarget & { path: string }) | null
  >(null)
  const build = useProjectBuild({
    beforeBuild: onSaveDocument,
    projectPath: session.project.path,
    rootFile: session.workspace.selectedRoot,
  })
  const latestBuild = build.state.runs[0] ?? null
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
        setBuildOpen(true)
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
  }, [onSetEditorFontSize, session.workspace.editorFontSize])

  return (
    <main className="grid h-svh min-h-144 grid-rows-[3.25rem_minmax(0,1fr)_1.75rem] overflow-hidden bg-workspace">
      <WorkspaceToolbar
        feedback={feedback}
        onOpenProject={onOpenProject}
        onOpenCommands={() => setCommandPaletteOpen(true)}
        onOpenBuild={() => setBuildOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={onOpenSettings}
        onReturnHome={onReturnHome}
        onSave={onSaveDocument}
        session={session}
      />

      <ResizablePanelGroup className="min-h-0 min-w-0" orientation="vertical">
        <ResizablePanel id="workspace" minSize="35%">
          <ResizablePanelGroup
            className="min-h-0 min-w-0"
            onLayoutChanged={(_layout, metadata) => {
              if (metadata.isUserInteraction) {
                onResizeSidebar(sidebarWidth.current, true)
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
                  selectedRoot={session.workspace.selectedRoot}
                  tree={session.project.tree}
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
              defaultSize={240}
              groupResizeBehavior="preserve-pixel-size"
              id="build-panel"
              maxSize="60%"
              minSize={160}
            >
              <BuildPanel
                dispatch={build.dispatch}
                engine={build.engine}
                onBuild={() => void build.build()}
                onClose={() => setBuildOpen(false)}
                onNavigate={(path, line) => {
                  setTarget({ path, line, column: 1, token: Date.now() })
                  onPinFile(path)
                }}
                onStop={() => void build.stop()}
                profiles={build.profiles}
                setEngine={build.setEngine}
                state={build.state}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>

      <footer className="flex min-w-0 items-center gap-3 border-t bg-status px-3 text-[11px] text-status-foreground">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
          Local project
        </span>
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
        <Button onClick={() => setBuildOpen(true)} size="xs" variant="ghost">
          <Hammer data-icon="inline-start" />
          {latestBuild === null
            ? "Build ready"
            : latestBuild.status === "running"
              ? "Building"
              : `Build ${latestBuild.status}`}
        </Button>
        <span className="ml-auto min-w-0">
          <RootFileControl
            onSelectRoot={onSelectRoot}
            project={session.project}
            selectedRoot={session.workspace.selectedRoot}
          />
        </span>
      </footer>
      <WorkspaceCommandPalette
        onOpenChange={setCommandPaletteOpen}
        onOpenFile={onPinFile}
        onOpenProject={onOpenProject}
        onSave={onSaveDocument}
        onSearch={() => setSearchOpen(true)}
        onZoomIn={() =>
          onSetEditorFontSize(session.workspace.editorFontSize + 1)
        }
        onZoomOut={() =>
          onSetEditorFontSize(session.workspace.editorFontSize - 1)
        }
        open={commandPaletteOpen}
        tree={session.project.tree}
      />
    </main>
  )
}
