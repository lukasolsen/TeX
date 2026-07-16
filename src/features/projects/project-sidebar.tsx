import {
  BookOpenText,
  FileCode2,
  Image,
  Library,
  Link2,
  ListTree,
  LoaderCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AsyncDocumentState, ProjectEntry } from "@/domain/project"
import { ProjectTree } from "@/features/projects/project-tree"
import { DocumentOutlinePanel } from "@/features/projects/document-outline-panel"
import {
  isReadableSource,
  isPdf,
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

function DependencyIcon({ kind }: { kind: TexDependency["kind"] }) {
  if (kind === "asset") return <Image aria-hidden="true" />
  if (kind === "package") return <Library aria-hidden="true" />
  if (kind === "bibliography") return <BookOpenText aria-hidden="true" />
  return <FileCode2 aria-hidden="true" />
}

function DirectReferencesPanel({
  documentState,
  onOpenPdf,
  onPinFile,
  onPreviewFile,
  tree,
}: {
  documentState: AsyncDocumentState
  onOpenPdf: (path: string) => void
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
        Reading references in {documentState.path}…
      </p>
    )
  }

  if (
    documentState.status !== "ready" ||
    !documentState.document.path.toLowerCase().endsWith(".tex")
  ) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Select a TeX source file to inspect the files and packages it references
        directly.
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
        No direct references were found in {documentState.document.path}.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="border-b px-3 py-3">
        <p className="truncate text-xs font-medium">
          {documentState.document.path}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Direct references found in this file. Included files are not traced
          recursively, and installed LaTeX packages are not validated.
        </p>
      </div>
      <ul
        className="p-1.5"
        aria-label={`Direct references in ${documentState.document.path}`}
      >
        {dependencies.map((dependency) => {
          const available =
            dependency.kind !== "package" &&
            treeContainsPath(tree, dependency.path)
          const readable = available && isReadableSource(dependency.path)
          const pdf = available && isPdf(dependency.path)
          const status =
            dependency.kind === "package"
              ? "LaTeX"
              : available
                ? "In project"
                : "Missing"
          return (
            <li key={`${dependency.command}:${dependency.path}`}>
              <button
                className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default"
                disabled={!readable && !pdf}
                onClick={() => {
                  if (pdf) onOpenPdf(dependency.path)
                  else onPreviewFile(dependency.path)
                }}
                onDoubleClick={() => {
                  if (pdf) onOpenPdf(dependency.path)
                  else onPinFile(dependency.path)
                }}
                title={
                  dependency.kind === "package"
                    ? `${dependency.path} is resolved by the LaTeX environment at build time`
                    : readable || pdf
                      ? `Open ${dependency.path}`
                      : available
                        ? `${dependency.path} cannot be previewed`
                        : `${dependency.path} is not available in this project`
                }
                type="button"
              >
                <span className="shrink-0 text-muted-foreground [&>svg]:size-3.5">
                  <DependencyIcon kind={dependency.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {dependency.path}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {dependencyDescription(dependency)} · \\
                    {dependency.command}
                  </span>
                </span>
                <Badge
                  variant={status === "Missing" ? "destructive" : "secondary"}
                >
                  {status}
                </Badge>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Keeps project navigation and the active source file's direct references together. */
export function ProjectSidebar({
  activeLine,
  documentState,
  onCreate,
  onDelete,
  onPinFile,
  onPreviewFile,
  onOpenPdf,
  onRename,
  onNavigateOutline,
  rootFiles,
  selectedFile,
  selectedPdf,
  selectedRoot,
  tree,
}: {
  activeLine: number | null
  documentState: AsyncDocumentState
  onCreate: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onDelete: (path: string) => Promise<void>
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onOpenPdf: (path: string) => void
  onRename: (path: string, name: string) => Promise<void>
  onNavigateOutline: (line: number) => void
  rootFiles: string[]
  selectedFile: string | null
  selectedPdf: string | null
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
          value="outline"
        >
          <ListTree data-icon="inline-start" />
          Outline
        </TabsTrigger>
        <TabsTrigger
          className="h-full flex-none rounded-none px-3 text-xs"
          value="references"
        >
          <Link2 data-icon="inline-start" />
          References
        </TabsTrigger>
      </TabsList>
      <TabsContent className="flex min-h-0 flex-1 flex-col" value="files">
        <ProjectTree
          onCreate={onCreate}
          onDelete={onDelete}
          onPinFile={onPinFile}
          onPreviewFile={onPreviewFile}
          onOpenPdf={onOpenPdf}
          onRename={onRename}
          rootFiles={rootFiles}
          selectedFile={selectedFile}
          selectedPdf={selectedPdf}
          selectedRoot={selectedRoot}
          tree={tree}
        />
      </TabsContent>
      <TabsContent className="min-h-0 overflow-y-auto" value="outline">
        <DocumentOutlinePanel
          activeLine={activeLine}
          documentState={documentState}
          onNavigate={onNavigateOutline}
        />
      </TabsContent>
      <TabsContent className="min-h-0 overflow-y-auto" value="references">
        <DirectReferencesPanel
          documentState={documentState}
          onOpenPdf={onOpenPdf}
          onPinFile={onPinFile}
          onPreviewFile={onPreviewFile}
          tree={tree}
        />
      </TabsContent>
    </Tabs>
  )
}
