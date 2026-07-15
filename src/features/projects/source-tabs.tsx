import { Copy, FileCode2, Scissors, X } from "lucide-react"

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

export function SourceTabs({
  onClose,
  onCloseMany,
  onPin,
  onSelect,
  pinnedFiles,
  projectPath,
  selectedFile,
}: {
  onClose: (path: string) => void
  onCloseMany: (paths: string[]) => void
  onPin: (path: string) => void
  onSelect: (path: string) => void
  pinnedFiles: string[]
  projectPath: string
  selectedFile: string | null
}) {
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
      className="min-w-0 gap-0"
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
                    void navigator.clipboard.writeText(`${projectPath}/${path}`)
                  }
                >
                  <Copy />
                  Copy path
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => void navigator.clipboard.writeText(path)}
                >
                  <Copy />
                  Copy relative path
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
