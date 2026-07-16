import { FileCode2, FileStack, LoaderCircle } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AsyncDocumentState, ProjectEntry } from "@/domain/project"
import { ProjectTree } from "@/features/projects/project-tree"
import {
  isReadableSource,
  texDependencies,
  treeContainsPath,
  type TexDependency,
} from "@/features/projects/project-model"

function dependencyDescription(dependency: TexDependency): string {
  if (dependency.kind === "source") return "TeX source"
  if (dependency.kind === "bibliography") return "Bibliography"
  if (dependency.kind === "asset") return "Asset"
  return dependency.command === "documentclass"
    ? "Document class"
    : "LaTeX package"
}

function DependenciesPanel({
  documentState,
  onPinFile,
  onPreviewFile,
  tree,
}: {
  documentState: AsyncDocumentState
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  tree: ProjectEntry
}) {
  if (documentState.status === "loading") {
    return (
      <p
        className="flex items-center gap-2 p-4 text-xs text-muted-foreground"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-3.5 motion-safe:animate-spin"
        />
        Reading dependencies for {documentState.path}…
      </p>
    )
  }

  if (
    documentState.status !== "ready" ||
    !documentState.document.path.toLowerCase().endsWith(".tex")
  ) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Select a TeX source file to see its direct dependencies.
      </p>
    )
  }

  const dependencies = texDependencies(
    documentState.content,
    documentState.document.path
  )
  if (dependencies.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No direct dependencies were found in {documentState.document.path}.
      </p>
    )
  }

  return (
    <ul
      className="p-1.5"
      aria-label={`Dependencies of ${documentState.document.path}`}
    >
      {dependencies.map((dependency) => {
        const available =
          dependency.kind !== "package" &&
          treeContainsPath(tree, dependency.path)
        const readable = available && isReadableSource(dependency.path)
        return (
          <li key={`${dependency.command}:${dependency.path}`}>
            <button
              className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default"
              disabled={!readable}
              onClick={() => onPreviewFile(dependency.path)}
              onDoubleClick={() => onPinFile(dependency.path)}
              title={
                readable
                  ? `Open ${dependency.path}`
                  : available
                    ? `${dependency.path} cannot be previewed`
                    : `${dependency.path} is not available in this project`
              }
              type="button"
            >
              <FileCode2 aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">
                  {dependency.path}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {dependencyDescription(dependency)} · \\
                  {dependency.command}
                  {available ? "" : " · Not in project"}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Keeps project navigation and the active source file's direct dependencies together. */
export function ProjectSidebar({
  documentState,
  onCreate,
  onDelete,
  onPinFile,
  onPreviewFile,
  onRename,
  rootFiles,
  selectedFile,
  selectedRoot,
  tree,
}: {
  documentState: AsyncDocumentState
  onCreate: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onDelete: (path: string) => Promise<void>
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onRename: (path: string, name: string) => Promise<void>
  rootFiles: string[]
  selectedFile: string | null
  selectedRoot: string | null
  tree: ProjectEntry
}) {
  return (
    <Tabs className="size-full min-h-0 gap-0 bg-sidebar" defaultValue="files">
      <TabsList
        className="h-10 w-full shrink-0 justify-start gap-0 rounded-none border-b bg-sidebar p-0"
        variant="line"
      >
        <TabsTrigger
          className="h-full flex-none rounded-none px-3 text-xs"
          value="files"
        >
          <FileCode2 data-icon="inline-start" />
          Files
        </TabsTrigger>
        <TabsTrigger
          className="h-full flex-none rounded-none px-3 text-xs"
          value="dependencies"
        >
          <FileStack data-icon="inline-start" />
          Dependencies
        </TabsTrigger>
      </TabsList>
      <TabsContent className="flex min-h-0 flex-1 flex-col" value="files">
        <ProjectTree
          onCreate={onCreate}
          onDelete={onDelete}
          onPinFile={onPinFile}
          onPreviewFile={onPreviewFile}
          onRename={onRename}
          rootFiles={rootFiles}
          selectedFile={selectedFile}
          selectedRoot={selectedRoot}
          tree={tree}
        />
      </TabsContent>
      <TabsContent className="min-h-0 overflow-y-auto" value="dependencies">
        <DependenciesPanel
          documentState={documentState}
          onPinFile={onPinFile}
          onPreviewFile={onPreviewFile}
          tree={tree}
        />
      </TabsContent>
    </Tabs>
  )
}
