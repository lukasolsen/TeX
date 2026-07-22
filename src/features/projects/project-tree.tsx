import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react"
import {
  Copy,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileCode2,
  File,
  FileText,
  FileType2,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Settings2,
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
import type { HiddenEntryPredicate } from "@/domain/file-visibility"
import type { ProjectRelativePath } from "@/domain/identifiers"
import {
  countHiddenEntries,
  isReadableSource,
  isPdf,
  projectTreeNodes,
} from "@/features/projects/project-model"
import { cn } from "@/lib/utils"
import { runDetached } from "@/lib/promises"
import { useClipboard } from "@/lib/use-clipboard"

type CreationTarget = {
  parentPath: ProjectRelativePath | null
  directory: boolean
}

function CreateEntryInput({
  directory,
  onCancel,
  onCreate,
  onComplete,
  parentPath,
}: CreationTarget & {
  onCancel: () => void
  onCreate: (
    parentPath: ProjectRelativePath | null,
    name: string,
    directory: boolean
  ) => Promise<boolean>
  onComplete: (created: boolean) => void
}): ReactElement {
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
    try {
      const created = await onCreate(parentPath, value, directory)
      onComplete(created)
      onCancel()
    } finally {
      submitting.current = false
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      runDetached(submit())
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
        aria-label={directory ? "New folder name" : "New file name"}
        className="h-6 rounded-sm px-1.5 text-ui"
        onBlur={() => runDetached(submit())}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={directory ? "Folder name" : "File name"}
        ref={input}
        value={name}
      />
    </li>
  )
}

function RenameEntryInput({
  entry,
  level,
  onCancel,
  onRename,
}: {
  entry: ProjectEntry & { path: ProjectRelativePath }
  level: number
  onCancel: () => void
  onRename: (path: ProjectRelativePath, name: string) => Promise<boolean>
}): ReactElement {
  const [name, setName] = useState(entry.name)
  const input = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const submit = async (): Promise<void> => {
    if (submitting.current) return
    const value = name.trim()
    if (value === "" || value === entry.name) {
      onCancel()
      return
    }
    submitting.current = true
    try {
      if (await onRename(entry.path, value)) onCancel()
    } finally {
      submitting.current = false
    }
  }

  return (
    <div
      className="flex h-7 items-center gap-1.5 pr-2"
      style={{ paddingInlineStart: `${22 + level * 14}px` }}
    >
      <EntryIcon
        expanded
        isDirectory={entry.kind === "directory"}
        path={entry.path}
      />
      <Input
        aria-label={`Rename ${entry.name}`}
        className="h-6 min-w-0 rounded-sm px-1.5 text-ui"
        onBlur={() => runDetached(submit())}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            runDetached(submit())
          } else if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
        ref={input}
        value={name}
      />
    </div>
  )
}

function EntryIcon({
  expanded,
  isDirectory,
  path,
}: {
  expanded: boolean
  isDirectory: boolean
  path: ProjectRelativePath
}): ReactElement {
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

/**
 * Resolves one level of the tree against the visibility rules. Hidden entries
 * are kept in the list while revealed so they can render de-emphasised rather
 * than shifting the layout when the reveal is toggled off again.
 */
function visibleChildren(
  entry: ProjectEntry,
  parentPath: ProjectRelativePath | null,
  isHidden: HiddenEntryPredicate,
  revealed: boolean
): Array<{
  node: ReturnType<typeof projectTreeNodes>[number]
  hidden: boolean
}> {
  return projectTreeNodes(entry, parentPath)
    .map((node) => ({ node, hidden: isHidden(node.name) }))
    .filter(({ hidden }) => revealed || !hidden)
}

function TreeBranch({
  creation,
  entry,
  hidden,
  isHidden,
  revealed,
  level,
  onPinFile,
  onCopyPath,
  onPreviewFile,
  onOpenPdf,
  onCreate,
  onCompleteCreate,
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
  entry: ProjectEntry & { path: ProjectRelativePath }
  hidden: boolean
  isHidden: HiddenEntryPredicate
  revealed: boolean
  level: number
  onPinFile: (path: ProjectRelativePath) => void
  onCopyPath: (path: ProjectRelativePath) => void
  onPreviewFile: (path: ProjectRelativePath) => void
  onOpenPdf: (path: ProjectRelativePath) => void
  onCreate: (
    parentPath: ProjectRelativePath | null,
    name: string,
    directory: boolean
  ) => Promise<boolean>
  onCompleteCreate: (created: boolean) => void
  onCancelCreate: () => void
  onStartCreate: (target: CreationTarget) => void
  onRename: (path: ProjectRelativePath, name: string) => Promise<boolean>
  onDelete: (path: ProjectRelativePath) => Promise<void>
  rootFiles: ProjectRelativePath[]
  selectedFile: ProjectRelativePath | null
  selectedPdf: ProjectRelativePath | null
  selectedRoot: ProjectRelativePath | null
}): ReactElement {
  const selectedDescendant = [selectedFile, selectedPdf, selectedRoot].some(
    (path) => path === entry.path || path?.startsWith(`${entry.path}/`) === true
  )
  const [expanded, setExpanded] = useState(level < 1 || selectedDescendant)
  const [renaming, setRenaming] = useState(false)
  const isDirectory = entry.kind === "directory"
  const readable = !isDirectory && isReadableSource(entry.path)
  const pdf = !isDirectory && isPdf(entry.path)
  const rootLabel =
    !isDirectory && selectedRoot === entry.path
      ? "Root"
      : !isDirectory && rootFiles.includes(entry.path)
        ? "Root candidate"
        : null

  useEffect(() => {
    if (selectedDescendant) setExpanded(true)
  }, [selectedDescendant])

  return (
    <li>
      {renaming ? (
        <RenameEntryInput
          entry={entry}
          level={level}
          onCancel={() => setRenaming(false)}
          onRename={onRename}
        />
      ) : (
        <ContextMenu>
          <ContextMenuTrigger>
            <button
              aria-expanded={isDirectory ? expanded : undefined}
              className={cn(
                "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left text-ui outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-55 [&>svg]:shrink-0",
                (selectedFile === entry.path || selectedPdf === entry.path) &&
                  "bg-sidebar-accent text-foreground",
                // Revealed-but-filtered entries read as present yet secondary,
                // so the reveal never disguises itself as the normal listing.
                hidden && "text-muted-foreground"
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
                  <ChevronDown
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
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
              {hidden ? (
                <EyeOff
                  aria-label="Hidden by a file filter rule"
                  className="size-3 text-muted-foreground"
                />
              ) : null}
              {rootLabel !== null ? (
                <Badge variant="secondary">{rootLabel}</Badge>
              ) : null}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => {
                onCopyPath(entry.path)
              }}
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
            <ContextMenuItem onClick={() => setRenaming(true)}>
              <Pencil />
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                runDetached(onDelete(entry.path))
              }}
              variant="destructive"
            >
              <Trash2 />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
      {isDirectory && expanded ? (
        <ul>
          {visibleChildren(entry, entry.path, isHidden, revealed).map(
            ({ node: child, hidden: childHidden }) => (
              <TreeBranch
                creation={creation}
                entry={child}
                hidden={childHidden}
                isHidden={isHidden}
                revealed={revealed}
                key={child.path}
                level={level + 1}
                onPinFile={onPinFile}
                onCopyPath={onCopyPath}
                onPreviewFile={onPreviewFile}
                onOpenPdf={onOpenPdf}
                onCreate={onCreate}
                onCompleteCreate={onCompleteCreate}
                onCancelCreate={onCancelCreate}
                onStartCreate={onStartCreate}
                onRename={onRename}
                onDelete={onDelete}
                rootFiles={rootFiles}
                selectedFile={selectedFile}
                selectedPdf={selectedPdf}
                selectedRoot={selectedRoot}
              />
            )
          )}
          {creation?.parentPath === entry.path ? (
            <CreateEntryInput
              directory={creation.directory}
              onCancel={onCancelCreate}
              onCreate={onCreate}
              onComplete={onCompleteCreate}
              parentPath={entry.path}
            />
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

export function ProjectTree({
  isHidden,
  onOpenFileSettings,
  onPinFile,
  onPreviewFile,
  onOpenPdf,
  onCreate,
  onRefresh,
  onRename,
  onDelete,
  rootFiles,
  selectedFile,
  selectedPdf,
  selectedRoot,
  tree,
}: {
  isHidden: HiddenEntryPredicate
  onOpenFileSettings: () => void
  onPinFile: (path: ProjectRelativePath) => void
  onPreviewFile: (path: ProjectRelativePath) => void
  onOpenPdf: (path: ProjectRelativePath) => void
  onCreate: (
    parentPath: ProjectRelativePath | null,
    name: string,
    directory: boolean
  ) => Promise<boolean>
  onRefresh: () => void
  onRename: (path: ProjectRelativePath, name: string) => Promise<boolean>
  onDelete: (path: ProjectRelativePath) => Promise<void>
  rootFiles: ProjectRelativePath[]
  selectedFile: ProjectRelativePath | null
  selectedPdf: ProjectRelativePath | null
  selectedRoot: ProjectRelativePath | null
  tree: ProjectEntry
}): ReactElement {
  const [creation, setCreation] = useState<CreationTarget | null>(null)
  const [creationError, setCreationError] = useState<string | null>(null)
  // Revealing is deliberately session-local: it answers "where did my file go?"
  // without silently rewriting the rules the user configured in Settings.
  const [revealed, setRevealed] = useState(false)
  const clipboard = useClipboard()
  const hiddenCount = useMemo(
    () => countHiddenEntries(tree, isHidden),
    [isHidden, tree]
  )
  const copyPath = (path: string): void => {
    runDetached(clipboard.copyText(path))
  }
  const startCreation = (target: CreationTarget): void => {
    setCreationError(null)
    setCreation(target)
  }
  const completeCreation = (created: boolean): void => {
    if (!created) {
      setCreationError(
        "Could not create the project entry. Your remaining files are safe."
      )
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1">
        <aside
          className="flex min-h-0 flex-1 flex-col bg-sidebar select-none"
          aria-label="Project files"
        >
          <ScrollArea className="mt-2 min-h-0 flex-1 px-1.5 pb-3">
            <ul>
              {visibleChildren(tree, null, isHidden, revealed).map(
                ({ node: entry, hidden }) => (
                  <TreeBranch
                    creation={creation}
                    entry={entry}
                    hidden={hidden}
                    isHidden={isHidden}
                    revealed={revealed}
                    key={entry.path}
                    level={0}
                    onPinFile={onPinFile}
                    onCopyPath={copyPath}
                    onPreviewFile={onPreviewFile}
                    onOpenPdf={onOpenPdf}
                    onCreate={onCreate}
                    onCompleteCreate={completeCreation}
                    onCancelCreate={() => setCreation(null)}
                    onStartCreate={startCreation}
                    onRename={onRename}
                    onDelete={onDelete}
                    rootFiles={rootFiles}
                    selectedFile={selectedFile}
                    selectedPdf={selectedPdf}
                    selectedRoot={selectedRoot}
                  />
                )
              )}
              {creation?.parentPath === null ? (
                <CreateEntryInput
                  directory={creation.directory}
                  onCancel={() => setCreation(null)}
                  onCreate={onCreate}
                  onComplete={completeCreation}
                  parentPath={null}
                />
              ) : null}
            </ul>
          </ScrollArea>
          {hiddenCount > 0 ? (
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-t px-2 text-meta text-muted-foreground">
              {revealed ? (
                <Eye aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <EyeOff aria-hidden="true" className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {hiddenCount === 1
                  ? "1 filtered item"
                  : `${hiddenCount} filtered items`}
              </span>
              <button
                aria-pressed={revealed}
                className="rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setRevealed((current) => !current)}
                type="button"
              >
                {revealed ? "Hide" : "Show"}
              </button>
              <button
                aria-label="Edit file filter rules in Settings"
                className="flex size-5 items-center justify-center rounded hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={onOpenFileSettings}
                title="Edit file filter rules"
                type="button"
              >
                <Settings2 aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : null}
          {creationError !== null ? (
            <p
              className="border-t px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {creationError}
            </p>
          ) : null}
          {clipboard.status !== null ? (
            <p
              className="border-t px-3 py-1.5 text-xs text-muted-foreground"
              role="status"
            >
              Relative path copied.
            </p>
          ) : null}
        </aside>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            startCreation({ parentPath: null, directory: false })
          }}
        >
          <FilePlus />
          New file
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            startCreation({ parentPath: null, directory: true })
          }}
        >
          <FolderPlus />
          New folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyPath(".")}>
          <Copy />
          Copy relative path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={hiddenCount === 0}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? <EyeOff /> : <Eye />}
          {revealed ? "Hide filtered items" : "Show filtered items"}
        </ContextMenuItem>
        <ContextMenuItem onClick={onOpenFileSettings}>
          <Settings2 />
          File filter rules…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
