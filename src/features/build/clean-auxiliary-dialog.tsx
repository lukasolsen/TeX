import { useEffect, useState } from "react"

import { AlertCircle, Trash2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { CleanPreview } from "@/domain/build"
import {
  cleanAuxiliaryFiles,
  previewCleanAuxiliaryFiles,
} from "@/services/build-service"
import { projectErrorFromUnknown } from "@/services/project-service"

type CleanState =
  | { status: "loading" }
  | { status: "ready"; preview: CleanPreview }
  | { status: "cleaning"; preview: CleanPreview }
  | { status: "error"; message: string }
  | { status: "done"; count: number }

export function CleanAuxiliaryDialog({
  onOpenChange,
  open,
  projectPath,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  projectPath: string
}) {
  const [state, setState] = useState<CleanState>({ status: "loading" })

  useEffect(() => {
    let active = true
    void previewCleanAuxiliaryFiles(projectPath)
      .then((preview) => {
        if (active) setState({ status: "ready", preview })
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
  }, [projectPath])

  const clean = async (preview: CleanPreview) => {
    setState({ status: "cleaning", preview })
    try {
      const count = await cleanAuxiliaryFiles(projectPath, preview.files)
      setState({ status: "done", count })
    } catch (error: unknown) {
      setState({
        status: "error",
        message: projectErrorFromUnknown(error).message,
      })
    }
  }

  const preview =
    state.status === "ready" || state.status === "cleaning"
      ? state.preview
      : null
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Clean auxiliary files</DialogTitle>
          <DialogDescription>
            Review the exact conservative list. TeX will not select source files
            or PDFs, and revalidates every path immediately before deletion.
          </DialogDescription>
        </DialogHeader>
        {state.status === "loading" ? (
          <p role="status">Scanning for auxiliary files…</p>
        ) : null}
        {preview !== null ? (
          preview.files.length === 0 ? (
            <p role="status">No recognized auxiliary files were found.</p>
          ) : (
            <>
              <p className="text-sm">
                {preview.files.length} files · {formatBytes(preview.totalBytes)}
              </p>
              {preview.truncated ? (
                <Alert>
                  <AlertCircle />
                  <AlertTitle>Preview limit reached</AlertTitle>
                  <AlertDescription>
                    Only the bounded preview below will be removed. Run clean
                    again to inspect any remaining generated files.
                  </AlertDescription>
                </Alert>
              ) : null}
              <ScrollArea className="h-64 rounded-md border bg-source p-2">
                <ul className="font-mono text-xs" aria-label="Files to remove">
                  {preview.files.map((file) => (
                    <li className="break-all" key={file}>
                      {file}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </>
          )
        ) : null}
        {state.status === "error" ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Clean unavailable</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
        {state.status === "done" ? (
          <p role="status">Removed {state.count} auxiliary files.</p>
        ) : null}
        <DialogFooter showCloseButton>
          {preview !== null && preview.files.length > 0 ? (
            <Button
              disabled={state.status === "cleaning"}
              onClick={() => void clean(preview)}
              variant="destructive"
            >
              <Trash2 data-icon="inline-start" />
              {state.status === "cleaning"
                ? "Cleaning…"
                : "Remove previewed files"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KiB`
}
