import { useState } from "react"
import {
  Copy,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileCode2,
  FileText,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProjectEntry } from "@/domain/project"
import {
  isReadableSource,
  projectTreeNodes,
} from "@/features/projects/project-model"
import { cn } from "@/lib/utils"

function EntryIcon({
  expanded,
  isDirectory,
  path,
}: {
  expanded: boolean
  isDirectory: boolean
  path: string
}) {
  if (isDirectory) {
    return expanded ? (
      <FolderOpen aria-hidden="true" className="size-3.5" />
    ) : (
      <Folder aria-hidden="true" className="size-3.5" />
    )
  }
  if (path.endsWith(".tex"))
    return <FileCode2 aria-hidden="true" className="size-3.5" />
  if (isReadableSource(path))
    return <FileText aria-hidden="true" className="size-3.5" />
  return <FileArchive aria-hidden="true" className="size-3.5" />
}

function TreeBranch({
  entry,
  level,
  onPinFile,
  onPreviewFile,
  onCreate,
  onRename,
  onDelete,
  selectedFile,
}: {
  entry: ProjectEntry & { path: string }
  level: number
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onCreate: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onRename: (path: string, name: string) => Promise<void>
  onDelete: (path: string) => Promise<void>
  selectedFile: string | null
}) {
  const [expanded, setExpanded] = useState(true)
  const isDirectory = entry.kind === "directory"
  const readable = !isDirectory && isReadableSource(entry.path)

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger>
          <button
            aria-expanded={isDirectory ? expanded : undefined}
            className={cn(
              "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left text-[13px] outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-55 [&>svg]:shrink-0",
              selectedFile === entry.path && "bg-sidebar-accent text-foreground"
            )}
            disabled={!isDirectory && !readable}
            onClick={() => {
              if (isDirectory) setExpanded((current) => !current)
              else if (readable) onPreviewFile(entry.path)
            }}
            onDoubleClick={() => {
              if (readable) onPinFile(entry.path)
            }}
            style={{ paddingInlineStart: `${8 + level * 14}px` }}
            title={
              !isDirectory && !readable
                ? "Preview is unavailable for this file type"
                : entry.path
            }
            type="button"
          >
            {isDirectory ? (
              expanded ? (
                <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                />
              )
            ) : (
              <span className="size-4 shrink-0" aria-hidden="true" />
            )}
            <EntryIcon
              expanded={expanded}
              isDirectory={isDirectory}
              path={entry.path}
            />
            <span className="truncate">{entry.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => void navigator.clipboard.writeText(entry.path)}
          >
            <Copy />
            Copy path<ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => void navigator.clipboard.writeText(entry.path)}
          >
            <Copy />
            Copy relative path<ContextMenuShortcut>⌘⇧C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          {isDirectory ? (
            <>
              <ContextMenuItem
                onClick={() => {
                  const name = window.prompt("New file name")
                  if (name !== null) void onCreate(entry.path, name, false)
                }}
              >
                <FilePlus />
                New file
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  const name = window.prompt("New folder name")
                  if (name !== null) void onCreate(entry.path, name, true)
                }}
              >
                <FolderPlus />
                New folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem
            onClick={() => {
              const name = window.prompt("Rename project entry", entry.name)
              if (name !== null && name !== entry.name) {
                void onRename(entry.path, name)
              }
            }}
          >
            <Pencil />
            Rename<ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${entry.path}? This permanently removes it from the project.`
                )
              ) {
                void onDelete(entry.path)
              }
            }}
            variant="destructive"
          >
            <Trash2 />
            Delete<ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isDirectory && expanded ? (
        <ul>
          {projectTreeNodes(entry, entry.path).map((child) => (
            <TreeBranch
              entry={child}
              key={child.path}
              level={level + 1}
              onPinFile={onPinFile}
              onPreviewFile={onPreviewFile}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              selectedFile={selectedFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function ProjectTree({
  onPinFile,
  onPreviewFile,
  onCreate,
  onRename,
  onDelete,
  selectedFile,
  tree,
}: {
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onCreate: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onRename: (path: string, name: string) => Promise<void>
  onDelete: (path: string) => Promise<void>
  selectedFile: string | null
  tree: ProjectEntry
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1">
        <aside
          className="flex min-h-0 flex-1 flex-col bg-sidebar select-none"
          aria-label="Project files"
        >
          <ScrollArea className="min-h-0 flex-1 px-1.5 pb-3">
            <ul>
              {projectTreeNodes(tree).map((entry) => (
                <TreeBranch
                  entry={entry}
                  key={entry.path}
                  level={0}
                  onPinFile={onPinFile}
                  onPreviewFile={onPreviewFile}
                  onCreate={onCreate}
                  onRename={onRename}
                  onDelete={onDelete}
                  selectedFile={selectedFile}
                />
              ))}
            </ul>
          </ScrollArea>
        </aside>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            const name = window.prompt("New file name")
            if (name !== null) void onCreate(null, name, false)
          }}
        >
          <FilePlus />
          New file<ContextMenuShortcut>⌘N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const name = window.prompt("New folder name")
            if (name !== null) void onCreate(null, name, true)
          }}
        >
          <FolderPlus />
          New folder<ContextMenuShortcut>⌘⇧N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => void navigator.clipboard.writeText(".")}
        >
          <Copy />
          Copy path<ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => void navigator.clipboard.writeText(".")}
        >
          <Copy />
          Copy relative path<ContextMenuShortcut>⌘⇧C</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
