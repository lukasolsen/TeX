import { useEffect } from "react"
import type { ReactElement } from "react"

import { AlertCircle, CheckCircle2, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { InstallNotice } from "@/domain/latex-install"
import { cn } from "@/lib/utils"

const SUCCESS_DISMISS_MS = 10_000

/**
 * Confirms a finished installation where the user is looking, without stealing
 * focus or blocking the workspace. A successful result retires itself; a
 * warning or failure stays until the user acknowledges it, because it still
 * requires a decision.
 */
export function LatexInstallToast({
  notice,
  onDismiss,
  onOpenDetails,
}: {
  notice: InstallNotice
  onDismiss: () => void
  onOpenDetails: () => void
}): ReactElement {
  useEffect(() => {
    if (notice.tone !== "success") return
    const timer = window.setTimeout(onDismiss, SUCCESS_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [notice, onDismiss])

  return (
    <div
      aria-live={notice.tone === "error" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto absolute right-3 bottom-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] items-start gap-2",
        "rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg",
        "animate-in duration-150 fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
      )}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <NoticeIcon tone={notice.tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">{notice.title}</p>
        <p className="text-xs text-muted-foreground">{notice.detail}</p>
        <Button
          className="h-auto w-fit p-0 text-xs"
          onClick={onOpenDetails}
          variant="link"
        >
          View installation details
        </Button>
      </div>
      <Button
        aria-label="Dismiss installation notice"
        className="-mt-1 -mr-1 shrink-0"
        onClick={onDismiss}
        size="icon-sm"
        variant="ghost"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

function NoticeIcon({ tone }: { tone: InstallNotice["tone"] }) {
  if (tone === "success")
    return (
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
    )
  if (tone === "warning")
    return (
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
    )
  return (
    <AlertCircle
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0 text-destructive"
    />
  )
}
