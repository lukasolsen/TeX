import { useRef, type ReactElement, type ReactNode } from "react"
import { CircleStop, Hammer, SquareTerminal, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { BottomPanelTab } from "@/domain/project"
import type { CanonicalProjectPath } from "@/domain/identifiers"
import {
  TerminalView,
  type TerminalHandle,
} from "@/features/terminal/terminal-view"

/**
 * Hosts the workspace's bottom dock as a two-tab surface: the existing build
 * panel and an integrated terminal. The terminal is kept mounted once started so
 * its live view and scroll position survive tab switches.
 */
export function BottomPanel({
  buildPanel,
  onClose,
  onTabChange,
  projectPath,
  tab,
  terminalStarted,
}: {
  buildPanel: ReactNode
  onClose: () => void
  onTabChange: (tab: BottomPanelTab) => void
  projectPath: CanonicalProjectPath
  tab: BottomPanelTab
  terminalStarted: boolean
}): ReactElement {
  const terminalRef = useRef<TerminalHandle>(null)

  return (
    <Tabs
      aria-label="Workspace panel"
      className="size-full min-h-0 gap-0 bg-workspace-chrome"
      onValueChange={(value) => {
        if (value === "build" || value === "terminal") onTabChange(value)
      }}
      value={tab}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-2">
        <TabsList
          className="h-full gap-1 border-0 bg-transparent p-0"
          variant="line"
        >
          <TabsTrigger className="flex-none gap-1.5 px-3 text-xs" value="build">
            <Hammer data-icon="inline-start" />
            Build
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-1.5 px-3 text-xs"
            value="terminal"
          >
            <SquareTerminal data-icon="inline-start" />
            Terminal
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-0.5">
          {tab === "terminal" ? (
            <Button
              aria-label="Terminate the shell"
              onClick={() => terminalRef.current?.kill()}
              size="icon-sm"
              title="Terminate the shell"
              variant="ghost"
            >
              <CircleStop aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            aria-label="Close panel"
            onClick={onClose}
            size="icon-sm"
            title="Close panel"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className={cn("size-full min-h-0", tab !== "build" && "hidden")}>
          {buildPanel}
        </div>
        {terminalStarted ? (
          <div
            className={cn("size-full min-h-0", tab !== "terminal" && "hidden")}
          >
            <TerminalView
              active={tab === "terminal"}
              projectPath={projectPath}
              ref={terminalRef}
            />
          </div>
        ) : null}
      </div>
    </Tabs>
  )
}
