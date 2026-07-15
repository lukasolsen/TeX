import {
  FileCode2,
  FolderOpen,
  MessageSquareText,
  Search,
  Save,
  TextSearch,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import type { ProjectEntry } from "@/domain/project"
import { isReadableSource } from "@/features/projects/project-model"

function readableFiles(entry: ProjectEntry, parent = ""): string[] {
  const paths: string[] = []
  for (const child of entry.children) {
    const path = parent === "" ? child.name : `${parent}/${child.name}`
    if (child.kind === "directory") paths.push(...readableFiles(child, path))
    else if (isReadableSource(path)) paths.push(path)
  }
  return paths
}

export function WorkspaceCommandPalette({
  onOpenChange,
  onOpenFile,
  onOpenProject,
  onSave,
  onSearch,
  onZoomIn,
  onZoomOut,
  open,
  tree,
}: {
  onOpenChange: (open: boolean) => void
  onOpenFile: (path: string) => void
  onOpenProject: () => void
  onSave: () => void
  onSearch: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  open: boolean
  tree: ProjectEntry
}) {
  const run = (command: () => void) => {
    onOpenChange(false)
    command()
  }
  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandInput placeholder="Type a command or file name…" />
      <CommandList>
        <CommandEmpty>No matching command or source file.</CommandEmpty>
        <CommandGroup heading="Commands">
          <CommandItem onSelect={() => run(onSave)}>
            <Save /> Save source <CommandShortcut>Ctrl S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onSearch)}>
            <Search /> Search project{" "}
            <CommandShortcut>Ctrl Shift F</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => window.dispatchEvent(new Event("tex:find-in-file")))
            }
          >
            <TextSearch /> Find in current file
            <CommandShortcut>Ctrl F</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => window.dispatchEvent(new Event("tex:toggle-comment")))
            }
          >
            <MessageSquareText /> Toggle line comment
            <CommandShortcut>Ctrl /</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onOpenProject)}>
            <FolderOpen /> Open project
          </CommandItem>
          <CommandItem onSelect={() => run(onZoomIn)}>
            <ZoomIn /> Increase editor font
          </CommandItem>
          <CommandItem onSelect={() => run(onZoomOut)}>
            <ZoomOut /> Decrease editor font
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Open source file">
          {readableFiles(tree).map((path) => (
            <CommandItem
              key={path}
              onSelect={() => run(() => onOpenFile(path))}
              value={`open ${path}`}
            >
              <FileCode2 /> {path}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
