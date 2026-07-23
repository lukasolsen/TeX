import {
  FileCode2,
  FolderOpen,
  Hammer,
  History,
  MessageSquareText,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Save,
  Settings,
  SquareTerminal,
  TextSearch,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  ArrowDown,
  ArrowUp,
  Copy,
  ListStart,
  Play,
  ScrollText,
  Trash2,
} from "lucide-react"
import { useMemo, type ReactElement } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import type { ProjectEntry } from "@/domain/project"
import {
  projectRelativePath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import { isOpenableFile, isPdfFile } from "@/domain/file-kind"
import { shortcutLabel } from "@/lib/shortcuts"

/** Every file the palette can open in the source pane; a PDF has its own pane. */
function openableFiles(
  entry: ProjectEntry,
  parent: ProjectRelativePath | null = null
): ProjectRelativePath[] {
  const paths: ProjectRelativePath[] = []
  for (const child of entry.children) {
    const path = projectRelativePath(
      parent === null ? child.name : `${parent}/${child.name}`
    )
    if (child.kind === "directory") paths.push(...openableFiles(child, path))
    else if (isOpenableFile(path) && !isPdfFile(path)) paths.push(path)
  }
  return paths
}

export function WorkspaceCommandPalette({
  buildEnabled,
  diagnosticsAvailable,
  onBuild,
  onBuildAndView,
  onClean,
  onCopyDiagnostic,
  onFirstDiagnostic,
  onNextDiagnostic,
  onOpenChange,
  onOpenBuild,
  onOpenFile,
  onOpenProject,
  onOpenSettings,
  onPreviousDiagnostic,
  onRevealOutput,
  onShowLogContext,
  onTogglePdf,
  onToggleTerminal,
  onSave,
  onSearch,
  onToggleWatch,
  onZoomIn,
  onZoomOut,
  open,
  pdfOpen,
  watchActive,
  tree,
}: {
  buildEnabled: boolean
  diagnosticsAvailable: boolean
  onBuild: () => void
  onBuildAndView: () => void
  onClean: () => void
  onCopyDiagnostic: () => void
  onFirstDiagnostic: () => void
  onNextDiagnostic: () => void
  onOpenChange: (open: boolean) => void
  onOpenBuild: () => void
  onOpenFile: (path: ProjectRelativePath) => void
  onOpenProject: () => void
  onOpenSettings: () => void
  onPreviousDiagnostic: () => void
  onRevealOutput: () => void
  onShowLogContext: () => void
  onTogglePdf: () => void
  onToggleTerminal: () => void
  onSave: () => void
  onSearch: () => void
  onToggleWatch: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  open: boolean
  pdfOpen: boolean
  watchActive: boolean
  tree: ProjectEntry
}): ReactElement {
  const projectFiles = useMemo(
    () => (open ? openableFiles(tree) : []),
    [open, tree]
  )
  const run = (command: () => void) => {
    onOpenChange(false)
    command()
  }
  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandInput placeholder="Type a command or file name…" />
      <CommandList>
        <CommandEmpty>No matching command or source file.</CommandEmpty>
        <CommandGroup heading="Build & preview">
          <CommandItem disabled={!buildEnabled} onSelect={() => run(onBuild)}>
            <Hammer /> Build PDF
          </CommandItem>
          <CommandItem
            disabled={!buildEnabled}
            onSelect={() => run(onBuildAndView)}
          >
            <Play /> Build and view PDF
          </CommandItem>
          <CommandItem onSelect={() => run(onClean)}>
            <Trash2 /> Preview and clean auxiliary files
          </CommandItem>
          <CommandItem onSelect={() => run(onRevealOutput)}>
            <FolderOpen /> Reveal built PDF
          </CommandItem>
          <CommandItem onSelect={() => run(onToggleWatch)}>
            {watchActive ? <EyeOff /> : <Eye />}
            {watchActive ? "Stop watching project" : "Watch project and build"}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator className="mx-2" />
        <CommandGroup heading="Diagnostics">
          <CommandItem
            disabled={!diagnosticsAvailable}
            onSelect={() => run(onFirstDiagnostic)}
          >
            <ListStart /> Go to first diagnostic
          </CommandItem>
          <CommandItem
            disabled={!diagnosticsAvailable}
            onSelect={() => run(onNextDiagnostic)}
          >
            <ArrowDown /> Next diagnostic
            <CommandShortcut>F8</CommandShortcut>
          </CommandItem>
          <CommandItem
            disabled={!diagnosticsAvailable}
            onSelect={() => run(onPreviousDiagnostic)}
          >
            <ArrowUp /> Previous diagnostic
            <CommandShortcut>Shift F8</CommandShortcut>
          </CommandItem>
          <CommandItem
            disabled={!diagnosticsAvailable}
            onSelect={() => run(onCopyDiagnostic)}
          >
            <Copy /> Copy diagnostic
          </CommandItem>
          <CommandItem
            disabled={!diagnosticsAvailable}
            onSelect={() => run(onShowLogContext)}
          >
            <ScrollText /> Show diagnostic log context
          </CommandItem>
        </CommandGroup>
        <CommandSeparator className="mx-2" />
        <CommandGroup heading="Editing">
          <CommandItem onSelect={() => run(onSave)}>
            <Save /> Save source
            <CommandShortcut>{shortcutLabel(["primary", "s"])}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onSearch)}>
            <Search /> Search project{" "}
            <CommandShortcut>
              {shortcutLabel(["primary", "shift", "f"])}
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => window.dispatchEvent(new Event("tex:find-in-file")))
            }
          >
            <TextSearch /> Find in current file
            <CommandShortcut>{shortcutLabel(["primary", "f"])}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => window.dispatchEvent(new Event("tex:toggle-comment")))
            }
          >
            <MessageSquareText /> Toggle line comment
            <CommandShortcut>{shortcutLabel(["primary", "/"])}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onZoomIn)}>
            <ZoomIn /> Increase editor font
          </CommandItem>
          <CommandItem onSelect={() => run(onZoomOut)}>
            <ZoomOut /> Decrease editor font
          </CommandItem>
        </CommandGroup>
        <CommandSeparator className="mx-2" />
        <CommandGroup heading="Workspace">
          <CommandItem onSelect={() => run(onOpenBuild)}>
            <PanelBottomOpen /> Show build details
            <CommandShortcut>
              {shortcutLabel(["primary", "shift", "b"])}
            </CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onToggleTerminal)}>
            <SquareTerminal /> Toggle terminal
            <CommandShortcut>{shortcutLabel(["primary", "j"])}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onTogglePdf)}>
            {pdfOpen ? <PanelRightClose /> : <PanelRightOpen />}
            {pdfOpen ? "Hide PDF viewer" : "Show PDF viewer"}
          </CommandItem>
          <CommandItem onSelect={() => run(onOpenProject)}>
            <FolderOpen /> Open project
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() =>
                window.dispatchEvent(new Event("tex:open-recent-projects"))
              )
            }
          >
            <History /> Recent projects
            <CommandShortcut>{shortcutLabel(["primary", "r"])}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onOpenSettings)}>
            <Settings /> Open settings
          </CommandItem>
        </CommandGroup>
        <CommandSeparator className="mx-2" />
        <CommandGroup heading="Open project file">
          {projectFiles.map((path) => (
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
