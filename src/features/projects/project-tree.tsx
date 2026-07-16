import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import {
  Copy,
  ChevronDown,
  ChevronRight,
  FileCode2,
  File,
  FileText,
  FileType2,
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import type { ProjectEntry } from "@/domain/project"
import {
  isReadableSource,
  isPdf,
  projectTreeNodes,
} from "@/features/projects/project-model"
import { cn } from "@/lib/utils"

type CreationTarget = {
  parentPath: string | null
  directory: boolean
}

function CreateEntryInput({
  directory,
  onCancel,
  onCreate,
  parentPath,
}: CreationTarget & {
  onCancel: () => void
  onCreate: (parentPath: string | null, name: string, directory: boolean) => Promise<void>
}) {
  const [name, setName] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)

  useEffect(() => {
    input.current?.focus()
  }, [])

  const submit = async () => {
    if (submitting.current) return
    const value = name.trim()
    if (value === "") {
      onCancel()
      return
    }
    submitting.current = true
    await onCreate(parentPath, value, directory)
    onCancel()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      void submit()
    } else if (event.key === "Escape") {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <li className="flex h-7 items-center gap-1.5 px-2">
      {directory ? (
        <Folder aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <File aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <Input
        aria-label={directory ? "New folder path" : "New file path"}
        className="h-6 rounded-sm px-1.5 text-[13px]"
        onBlur={() => void submit()}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={directory ? "Folder name" : "File name"}
        ref={input}
        value={name}
      />
    </li>
  )
}

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
  if (isPdf(path)) return <FileType2 aria-hidden="true" className="size-3.5" />
  return <File aria-hidden="true" className="size-3.5" />
}

function TreeBranch({
  creation,
  entry,
  level,
  onPinFile,
  onPreviewFile,
  onOpenPdf,
  onCreate,
  onCancelCreate,
  onStartCreate,
  onRename,
  onDelete,
  rootFiles,
  selectedFile,
  selectedPdf,
  selectedRoot,
}: {
  creation: CreationTarget | null
  entry: ProjectEntry & { path: string }
  level: number
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onOpenPdf: (path: string) => void
  onCreate: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onCancelCreate: () => void
  onStartCreate: (target: CreationTarget) => void
  onRename: (path: string, name: string) => Promise<void>
  onDelete: (path: string) => Promise<void>
  rootFiles: string[]
  selectedFile: string | null
  selectedPdf: string | null
  selectedRoot: string | null
}) {
  const [expanded, setExpanded] = useState(true)
  const isDirectory = entry.kind === "directory"
  const readable = !isDirectory && isReadableSource(entry.path)
  const pdf = !isDirectory && isPdf(entry.path)
  const rootLabel =
    !isDirectory && selectedRoot === entry.path
      ? "Root"
      : !isDirectory && rootFiles.includes(entry.path)
        ? "Root candidate"
        : null

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger>
          <button
            aria-expanded={isDirectory ? expanded : undefined}
            className={cn(
              "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left text-[13px] outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-55 [&>svg]:shrink-0",
              (selectedFile === entry.path || selectedPdf === entry.path) &&
                "bg-sidebar-accent text-foreground"
            )}
            disabled={!isDirectory && !readable && !pdf}
            onClick={() => {
              if (isDirectory) setExpanded((current) => !current)
              else if (pdf) onOpenPdf(entry.path)
              else if (readable) onPreviewFile(entry.path)
            }}
            onDoubleClick={() => {
              if (pdf) onOpenPdf(entry.path)
              else if (readable) onPinFile(entry.path)
            }}
            style={{ paddingInlineStart: `${8 + level * 14}px` }}
            title={
              !isDirectory && !readable && !pdf
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
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {rootLabel !== null ? (
              <Badge variant="secondary">{rootLabel}</Badge>
            ) : null}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => void navigator.clipboard.writeText(entry.path)}
          >
            <Copy />
            Copy path
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => void navigator.clipboard.writeText(entry.path)}
          >
            <Copy />
            Copy relative path
          </ContextMenuItem>
          <ContextMenuSeparator />
          {isDirectory ? (
            <>
              <ContextMenuItem
                onClick={() => {
                  setExpanded(true)
                  onStartCreate({ parentPath: entry.path, directory: false })
                }}
              >
                <FilePlus />
                New file
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setExpanded(true)
                  onStartCreate({ parentPath: entry.path, directory: true })
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
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              void onDelete(entry.path)
            }}
            variant="destructive"
          >
            <Trash2 />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isDirectory && expanded ? (
        <ul>
          {projectTreeNodes(entry, entry.path).map((child) => (
            <TreeBranch
              creation={creation}
              entry={child}
              key={child.path}
              level={level + 1}
              onPinFile={onPinFile}
              onPreviewFile={onPreviewFile}
              onOpenPdf={onOpenPdf}
              onCreate={onCreate}
              onCancelCreate={onCancelCreate}
              onStartCreate={onStartCreate}
              onRename={onRename}
              onDelete={onDelete}
              rootFiles={rootFiles}
              selectedFile={selectedFile}
              selectedPdf={selectedPdf}
              selectedRoot={selectedRoot}
            />
          ))}
          {creation?.parentPath === entry.path ? (
            <CreateEntryInput
              directory={creation.directory}
              onCancel={onCancelCreate}
              onCreate={onCreate}
              parentPath={entry.path}
            />
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

export function ProjectTree({
  onPinFile,
  onPreviewFile,
  onOpenPdf,
  onCreate,
  onRename,
  onDelete,
  rootFiles,
  selectedFile,
  selectedPdf,
  selectedRoot,
  tree,
}: {
  onPinFile: (path: string) => void
  onPreviewFile: (path: string) => void
  onOpenPdf: (path: string) => void
  onCreate: (
    parentPath: string | null,
    name: string,
    directory: boolean
  ) => Promise<void>
  onRename: (path: string, name: string) => Promise<void>
  onDelete: (path: string) => Promise<void>
  rootFiles: string[]
  selectedFile: string | null
  selectedPdf: string | null
  selectedRoot: string | null
  tree: ProjectEntry
}) {
  const [creation, setCreation] = useState<CreationTarget | null>(null)

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1">
        <aside
          className="flex min-h-0 flex-1 flex-col bg-sidebar select-none"
          aria-label="Project files"
        >
          <ScrollArea className="mt-2 min-h-0 flex-1 px-1.5 pb-3">
            <ul>
              {projectTreeNodes(tree).map((entry) => (
                <TreeBranch
                  creation={creation}
                  entry={entry}
                  key={entry.path}
                  level={0}
                  onPinFile={onPinFile}
                  onPreviewFile={onPreviewFile}
                  onOpenPdf={onOpenPdf}
                  onCreate={onCreate}
                  onCancelCreate={() => setCreation(null)}
                  onStartCreate={setCreation}
                  onRename={onRename}
                  onDelete={onDelete}
                  rootFiles={rootFiles}
                  selectedFile={selectedFile}
                  selectedPdf={selectedPdf}
                  selectedRoot={selectedRoot}
                />
              ))}
              {creation?.parentPath === null ? (
                <CreateEntryInput
                  directory={creation.directory}
                  onCancel={() => setCreation(null)}
                  onCreate={onCreate}
                  parentPath={null}
                />
              ) : null}
            </ul>
          </ScrollArea>
        </aside>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            setCreation({ parentPath: null, directory: false })
          }}
        >
          <FilePlus />
          New file
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setCreation({ parentPath: null, directory: true })
          }}
        >
          <FolderPlus />
          New folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => void navigator.clipboard.writeText(".")}
        >
          <Copy />
          Copy path
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => void navigator.clipboard.writeText(".")}
        >
          <Copy />
          Copy relative path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
