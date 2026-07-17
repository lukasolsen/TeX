import { Menu } from "@base-ui/react/menu"
import { Menubar } from "@base-ui/react/menubar"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Braces, Command, Maximize2, Minimize2, Square, X } from "lucide-react"
import { useEffect, useState } from "react"
import type { MouseEvent, ReactElement, ReactNode } from "react"

import { runDetached } from "@/lib/promises"
import { shortcutLabel } from "@/lib/shortcuts"
import { cn } from "@/lib/utils"

import {
  windowChromeCommandCenter,
  windowChromeMode,
  windowMenuLabels,
} from "./window-chrome-model"

type WindowChromeProps = Readonly<{
  onNewWindow: () => void
  onOpenCommands: (() => void) | null
  onOpenProject: (() => void) | null
  onOpenSettings: (() => void) | null
  onReturnHome: (() => void) | null
}>

/** Compact desktop window chrome with platform-appropriate controls. */
export function WindowChrome({
  onNewWindow,
  onOpenCommands,
  onOpenProject,
  onOpenSettings,
  onReturnHome,
}: WindowChromeProps): ReactElement {
  const mode = windowChromeMode()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (mode === "macos-native") return
    const appWindow = getCurrentWindow()
    void appWindow
      .isMaximized()
      .then(setMaximized)
      .catch(() => undefined)
  }, [mode])

  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.buttons !== 1) return
    const appWindow = getCurrentWindow()
    if (event.detail === 2) {
      runDetached(
        appWindow.toggleMaximize().then(async () => {
          setMaximized(await appWindow.isMaximized())
        })
      )
      return
    }
    runDetached(appWindow.startDragging())
  }

  const toggleMaximize = () => {
    const appWindow = getCurrentWindow()
    runDetached(
      appWindow.toggleMaximize().then(async () => {
        setMaximized(await appWindow.isMaximized())
      })
    )
  }

  return (
    <header
      aria-label="Application title bar"
      className={cn(
        "relative flex h-9 shrink-0 items-stretch border-b bg-workspace-chrome text-foreground select-none",
        mode === "macos-native" && "pl-[4.5rem]"
      )}
    >
      <div
        aria-label="Application menu and drag region"
        className="flex min-w-0 flex-1 items-stretch"
        onMouseDown={startDragging}
        role="toolbar"
        tabIndex={-1}
      >
        <div className="flex items-center px-2 text-primary">
          <Braces aria-hidden="true" className="size-4" />
        </div>
        <Menubar className="flex items-stretch" modal={false}>
          {windowMenuLabels().map((label) => (
            <WindowMenu key={label} label={label}>
              <WindowMenuContent
                label={label}
                onNewWindow={onNewWindow}
                onOpenProject={onOpenProject}
                onOpenSettings={onOpenSettings}
                onReturnHome={onReturnHome}
              />
            </WindowMenu>
          ))}
        </Menubar>
      </div>
      {onOpenCommands !== null ? (
        <button
          aria-label="Open command palette"
          className="absolute top-1/2 left-1/2 hidden h-7 w-80 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border border-border/80 bg-muted/45 px-3 text-left text-xs text-muted-foreground shadow-xs transition-colors outline-none hover:border-border hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 min-[760px]:flex xl:w-96"
          onClick={onOpenCommands}
          type="button"
        >
          <Command aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">
            {windowChromeCommandCenter.label}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-border/70" />
          <span className="font-mono text-[10px] text-muted-foreground/75">
            {shortcutLabel(["primary", "shift", "p"])}
          </span>
        </button>
      ) : null}
      {mode === "custom-controls" ? (
        <div
          aria-label="Window controls"
          className="flex shrink-0 border-l border-border/70"
        >
          <WindowControl
            label="Minimize"
            onClick={() => runDetached(getCurrentWindow().minimize())}
          >
            <Minimize2 aria-hidden="true" />
          </WindowControl>
          <WindowControl
            label={maximized ? "Restore" : "Maximize"}
            onClick={toggleMaximize}
          >
            {maximized ? (
              <Square aria-hidden="true" className="size-3" />
            ) : (
              <Maximize2 aria-hidden="true" />
            )}
          </WindowControl>
          <WindowControl
            close
            label="Close"
            onClick={() => runDetached(getCurrentWindow().close())}
          >
            <X aria-hidden="true" />
          </WindowControl>
        </div>
      ) : null}
    </header>
  )
}

function WindowMenu({
  children,
  label,
}: {
  children: ReactNode
  label: string
}): ReactElement {
  return (
    <Menu.Root>
      <Menu.Trigger className="px-2 text-[12px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground data-open:bg-muted data-open:text-foreground">
        {label}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" side="bottom" sideOffset={4}>
          <Menu.Popup className="z-50 min-w-44 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg outline-none">
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function WindowMenuContent({
  label,
  onNewWindow,
  onOpenProject,
  onOpenSettings,
  onReturnHome,
}: Pick<
  WindowChromeProps,
  "onNewWindow" | "onOpenProject" | "onOpenSettings" | "onReturnHome"
> & { label: string }): ReactElement {
  if (label === "File") {
    return (
      <>
        <WindowMenuItem
          onClick={onNewWindow}
          shortcut={shortcutLabel(["primary", "shift", "n"])}
        >
          New Window
        </WindowMenuItem>
        {onOpenProject !== null ? (
          <WindowMenuItem onClick={onOpenProject}>Open project</WindowMenuItem>
        ) : null}
        {onReturnHome !== null ? (
          <WindowMenuItem onClick={onReturnHome}>Project home</WindowMenuItem>
        ) : null}
        <MenuInfo message="Project files stay on this device." />
      </>
    )
  }

  if (label === "View") {
    return (
      <>
        {onOpenSettings !== null ? (
          <WindowMenuItem onClick={onOpenSettings}>Settings</WindowMenuItem>
        ) : null}
        <MenuInfo message="Workspace panels are controlled from the editor." />
      </>
    )
  }

  if (label === "Help") {
    return (
      <div className="w-64 px-2 py-1.5">
        <p className="text-xs font-medium text-foreground">TeX support</p>
        <p className="mt-1 text-xs/5 text-muted-foreground">
          Support content is being designed around projects, builds, PDF
          preview, diagnostics, SyncTeX, and keyboard shortcuts.
        </p>
      </div>
    )
  }

  const descriptions: Record<string, string> = {
    Build: "Build controls are available in the workspace toolbar.",
    Edit: "Text editing actions are available in the source editor.",
    Search: "Project search is available in the workspace toolbar.",
    Window: "Use the window controls or your desktop shortcuts.",
  }
  return (
    <MenuInfo
      message={
        descriptions[label] ?? "Commands are not available in this menu."
      }
    />
  )
}

function MenuInfo({ message }: { message: string }): ReactElement {
  return (
    <p className="w-56 px-2 py-1.5 text-xs/5 text-muted-foreground">
      {message}
    </p>
  )
}

function WindowMenuItem({
  children,
  onClick,
  shortcut,
}: {
  children: string
  onClick: () => void
  shortcut?: string
}): ReactElement {
  return (
    <Menu.Item
      className="flex cursor-default items-center gap-6 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
      onClick={onClick}
    >
      {children}
      {shortcut !== undefined ? (
        <span className="ml-auto text-xs text-muted-foreground data-highlighted:text-inherit">
          {shortcut}
        </span>
      ) : null}
    </Menu.Item>
  )
}

function WindowControl({
  children,
  close = false,
  label,
  onClick,
}: {
  children: ReactElement
  close?: boolean
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex w-10 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors duration-100 outline-none hover:bg-foreground/7 hover:text-foreground focus-visible:bg-foreground/10 focus-visible:text-foreground [&_svg]:size-3.5 [&_svg]:stroke-[1.7]",
        close &&
          "border-l-0 hover:bg-[#c42b1c] hover:text-white focus-visible:bg-[#c42b1c] focus-visible:text-white"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}
