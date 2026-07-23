import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import { CircleCheck, CircleSlash } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { BuildToolReport } from "@/domain/build"
import { getBuildTools } from "@/services/build-service"
import { projectErrorFromUnknown } from "@/services/project-service"

type ToolsState =
  | { status: "loading" }
  | { status: "ready"; report: BuildToolReport }
  | { status: "error"; message: string }

/**
 * What TeX found on this computer, and what each absence costs.
 *
 * A missing tool has to explain itself: `synctex` is a hard dependency of
 * two-way navigation that used to fail with a generic "unavailable". The
 * distribution is named too, because a machine with two installs gives no
 * other way to tell which one is building the document.
 */
export function BuildToolsDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}): ReactElement {
  const [state, setState] = useState<ToolsState>({ status: "loading" })

  useEffect(() => {
    if (!open) return
    let active = true
    setState({ status: "loading" })
    void getBuildTools()
      .then((report) => {
        if (active) setState({ status: "ready", report })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: projectErrorFromUnknown(error).message,
          })
        }
      })
    return () => {
      active = false
    }
  }, [open])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>LaTeX tools</DialogTitle>
          <DialogDescription>
            {state.status === "ready" && state.report.distribution !== null
              ? `${state.report.distribution.label} · ${state.report.distribution.directory}`
              : "What TeX found on this computer."}
          </DialogDescription>
        </DialogHeader>

        {state.status === "loading" ? (
          <p className="text-sm text-muted-foreground">Detecting tools…</p>
        ) : state.status === "error" ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="LaTeX tools">
            {state.report.tools.map((tool) => (
              <li className="flex min-w-0 items-start gap-2" key={tool.name}>
                {tool.available ? (
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                ) : (
                  <CircleSlash
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm">{tool.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {tool.available ? "Installed" : "Not installed"}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {/* An absent tool states the consequence, not the absence. */}
                    {tool.available ? tool.purpose : tool.absence}
                  </span>
                  {tool.path === null ? null : (
                    <span className="block truncate font-mono text-micro text-muted-foreground/80">
                      {tool.path}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
