import { useRef } from "react"
import { LockKeyhole } from "lucide-react"

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

export function ProjectWorkspacePage({
  feedback,
  onOpenProject,
  onReturnHome,
  onResizeSidebar,
  onCloseFile,
  onCloseFiles,
  onCreateProjectEntry,
  onDeleteProjectEntry,
  onPinFile,
  onPreviewFile,
  onRenameProjectEntry,
  onSelectRoot,
  session,
}: {
  feedback: OpenProjectFeedback
  onOpenProject: () => void
  onReturnHome: () => void
  onResizeSidebar: (width: number, persist: boolean) => void
  onCloseFile: (path: string) => void
  onCloseFiles: (paths: string[]) => void
  onCreateProjectEntry: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onDeleteProjectEntry: (path: string) => Promise<void>
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onRenameProjectEntry: (path: string, name: string) => Promise<void>
  onSelectRoot: (path: string) => void
  session: ProjectSession
}) {
  const selectedFile = session.workspace.selectedFile
  const sidebarWidth = useRef(session.workspace.sidebarWidth)
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

  return (
    <main className="grid h-svh min-h-144 grid-rows-[3.25rem_minmax(0,1fr)_1.75rem] overflow-hidden bg-workspace">
      <WorkspaceToolbar
        feedback={feedback}
        onOpenProject={onOpenProject}
        onReturnHome={onReturnHome}
        session={session}
      />

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
          <ProjectSidebar
            onPinFile={onPinFile}
            onPreviewFile={onPreviewFile}
            onCreate={onCreateProjectEntry}
            onRename={onRenameProjectEntry}
            onDelete={onDeleteProjectEntry}
            documentState={session.documentState}
            rootFiles={session.project.rootCandidates.map((candidate) => candidate.path)}
            selectedFile={selectedFile}
            selectedRoot={session.workspace.selectedRoot}
            tree={session.project.tree}
          />
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
            <SourceViewer state={session.documentState} />
          </section>
        </ResizablePanel>
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
        <span className="ml-auto min-w-0">
          <RootFileControl
            onSelectRoot={onSelectRoot}
            project={session.project}
            selectedRoot={session.workspace.selectedRoot}
          />
        </span>
      </footer>
    </main>
  )
}
