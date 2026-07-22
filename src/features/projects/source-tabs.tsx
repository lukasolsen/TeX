import { Copy, FileCode2, Scissors, X } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { AsyncDocumentState } from "@/domain/project"
import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import { runDetached } from "@/lib/promises"
import { useClipboard } from "@/lib/use-clipboard"

function absoluteDisplayPath(
  projectPath: CanonicalProjectPath,
  relativePath: ProjectRelativePath
): string {
  const windowsPath = projectPath.includes("\\") && !projectPath.includes("/")
  const separator = windowsPath ? "\\" : "/"
  const root = projectPath.replace(/[\\/]$/, "")
  const child = windowsPath ? relativePath.replaceAll("/", "\\") : relativePath
  return `${root}${separator}${child}`
}

export function SourceTabs({
  onClose,
  onCloseMany,
  onPin,
  onSelect,
  documentState,
  pinnedFiles,
  projectPath,
  selectedFile,
}: {
  onClose: (path: ProjectRelativePath) => void
  onCloseMany: (paths: ReadonlyArray<ProjectRelativePath>) => void
  onPin: (path: ProjectRelativePath) => void
  onSelect: (path: ProjectRelativePath) => void
  documentState: AsyncDocumentState
  pinnedFiles: ReadonlyArray<ProjectRelativePath>
  projectPath: CanonicalProjectPath
  selectedFile: ProjectRelativePath | null
}): ReactElement {
  const clipboard = useClipboard()
  const previewFile =
    selectedFile !== null && !pinnedFiles.includes(selectedFile)
      ? selectedFile
      : null
  const files =
    previewFile === null ? pinnedFiles : [...pinnedFiles, previewFile]

  if (files.length === 0 || selectedFile === null) {
    return (
      <div className="flex h-10 shrink-0 items-center border-b bg-workspace-chrome px-4 text-xs text-muted-foreground">
        No source file selected
      </div>
    )
  }

  return (
    <Tabs
      className="relative min-w-0 gap-0"
      onValueChange={onSelect}
      value={selectedFile}
    >
      <TabsList
        className="h-10 w-full justify-start gap-0 overflow-x-auto border-b bg-workspace-chrome p-0"
        variant="line"
      >
        {files.map((path) => {
          const pinned = pinnedFiles.includes(path)
          const active = selectedFile === path
          const unsaved =
            active &&
            documentState.status === "ready" &&
            documentState.saveState.status !== "saved"
          return (
            <ContextMenu key={path}>
              <ContextMenuTrigger className="group/tab flex h-full min-w-0 shrink-0 items-center border-r">
                <TabsTrigger
                  className={cn(
                    "max-w-56 gap-1.5 rounded-none px-3 text-xs data-active:after:opacity-100",
                    !pinned && "italic"
                  )}
                  onDoubleClick={() => onPin(path)}
                  value={path}
                >
                  <FileCode2 data-icon="inline-start" />
                  <span className="truncate">{path}</span>
                  {unsaved ? <span aria-label="Unsaved changes">●</span> : null}
                </TabsTrigger>
                <Button
                  aria-label={`Close ${path}`}
                  className={cn(
                    "mr-1.5 opacity-0 transition-opacity group-hover/tab:opacity-100 focus-visible:opacity-100",
                    active && "opacity-100"
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(path)
                  }}
                  size="icon-xs"
                  title={`Close ${path}`}
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => onClose(path)}>
                  <X />
                  Close
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onCloseMany(files)}>
                  <Scissors />
                  Close all
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    const index = files.indexOf(path)
                    onCloseMany(files.slice(index + 1))
                  }}
                >
                  <Scissors />
                  Close all to the right
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    const index = files.indexOf(path)
                    onCloseMany(files.slice(0, index))
                  }}
                >
                  <Scissors />
                  Close all to the left
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() =>
                    runDetached(
                      clipboard.copyText(absoluteDisplayPath(projectPath, path))
                    )
                  }
                >
                  <Copy />
                  Copy path
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => runDetached(clipboard.copyText(path))}
                >
                  <Copy />
                  Copy relative path
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </TabsList>
      {clipboard.status !== null ? (
        <span
          className="pointer-events-none absolute top-2 right-2 rounded bg-popover px-2 py-1 text-[11px] shadow-sm"
          role="status"
        >
          Path copied
        </span>
      ) : null}
    </Tabs>
  )
}
