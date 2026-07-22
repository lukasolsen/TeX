import { useEffect, useRef, useState } from "react"
import type { ReactElement } from "react"

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleSlash,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Terminal,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  completedStepCount,
  elevationNotice,
  installStatusLabel,
  installStepSummary,
  type InstallOption,
  type InstallProgress,
  type InstallStepState,
  type LatexInstallState,
  type ManualInstruction,
} from "@/domain/latex-install"
import type { LatexInstallController } from "@/features/build/use-latex-install"
import { useClipboard } from "@/lib/use-clipboard"
import { runDetached } from "@/lib/promises"
import { cn } from "@/lib/utils"

export function LatexInstallDialog({
  controller,
  onOpenChange,
  open,
}: {
  controller: LatexInstallController
  onOpenChange: (open: boolean) => void
  open: boolean
}): ReactElement {
  const { progress, state } = controller
  const installing = progress !== null

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Install LaTeX</DialogTitle>
          <DialogDescription>
            {installing
              ? "TeX is running your system package manager. The exact command for every step is shown below."
              : "TeX runs your own system package manager. Nothing is downloaded until you start the installation."}
          </DialogDescription>
        </DialogHeader>
        {progress === null ? (
          <InstallChooser
            controller={controller}
            onOpenChange={onOpenChange}
            state={state}
          />
        ) : (
          <InstallRunner
            controller={controller}
            manual={state.status === "ready" ? state.support.manual : null}
            onOpenChange={onOpenChange}
            progress={progress}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InstallChooser({
  controller,
  onOpenChange,
  state,
}: {
  controller: LatexInstallController
  onOpenChange: (open: boolean) => void
  state: LatexInstallState
}) {
  const [selected, setSelected] = useState<string | null>(null)
  if (state.status === "loading") {
    return (
      <>
        <p className="text-sm text-muted-foreground" role="status">
          Checking which package managers are available on this computer…
        </p>
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </>
    )
  }
  if (state.status === "unavailable") {
    return (
      <>
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Installation options unavailable</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </>
    )
  }

  const { manual, options, platform, unavailable } = state.support
  const recommended = options.find((option) => option.recommended) ?? options[0]
  const active =
    options.find((option) => option.method === selected) ?? recommended ?? null

  return (
    <>
      {options.length === 0 ? (
        <Alert>
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>
            {unavailable.length === 0
              ? `TeX cannot install LaTeX on this ${platform} system`
              : "No usable package manager was found"}
          </AlertTitle>
          <AlertDescription>
            {unavailable.length === 0
              ? `TeX installs LaTeX only through a package manager it recognizes, and none apply to this ${platform} system. Install a distribution yourself using the instructions below.`
              : `TeX installs LaTeX only through a package manager already present on this ${platform} system. Each route it knows about is listed below with what is missing.`}
          </AlertDescription>
        </Alert>
      ) : (
        <div
          aria-label={`LaTeX distributions available on ${platform}`}
          className="flex flex-col gap-2"
          role="radiogroup"
        >
          {options.map((option) => (
            <InstallOptionCard
              key={option.method}
              onSelect={() => setSelected(option.method)}
              option={option}
              selected={active?.method === option.method}
            />
          ))}
        </div>
      )}
      {unavailable.length === 0 ? null : (
        <ul
          aria-label="Installation routes that are unavailable"
          className="flex flex-col gap-1.5"
        >
          {unavailable.map((blocked) => (
            <li
              className="flex min-w-0 items-start gap-2 rounded-lg border border-dashed p-2.5"
              key={blocked.manager}
            >
              <ShieldAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {blocked.distribution} via {blocked.manager}
                  <Badge className="ml-2" variant="outline">
                    Unavailable
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  {blocked.reason}
                </span>
                <span className="text-xs break-all text-muted-foreground">
                  {blocked.documentation}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ManualFallback manual={manual} platform={platform} />
      {controller.startError !== null ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Installation could not start</AlertTitle>
          <AlertDescription>{controller.startError}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Cancel
        </Button>
        {active === null ? null : (
          <Button
            disabled={controller.starting}
            onClick={() => runDetached(controller.install(active.method))}
          >
            {controller.starting ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
              />
            ) : (
              <Download aria-hidden="true" data-icon="inline-start" />
            )}
            {controller.starting
              ? "Starting…"
              : `Install ${active.distribution}`}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function InstallOptionCard({
  onSelect,
  option,
  selected,
}: {
  onSelect: () => void
  option: InstallOption
  selected: boolean
}) {
  const command = option.steps[1]?.command ?? option.steps[0]?.command ?? ""
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-accent/40" : "hover:bg-accent/20",
        "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <input
          checked={selected}
          className="size-4 shrink-0 accent-primary"
          name="latex-install-option"
          onChange={onSelect}
          type="radio"
          value={option.method}
        />
        <span className="font-medium">{option.distribution}</span>
        <Badge variant="outline">{option.manager}</Badge>
        {option.recommended ? (
          <Badge variant="secondary">Recommended</Badge>
        ) : null}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {option.downloadEstimate}
        </span>
      </span>
      <span className="text-sm text-muted-foreground">{option.summary}</span>
      <span className="flex flex-wrap gap-1">
        {option.packages.map((packageName) => (
          <Badge className="font-mono" key={packageName} variant="outline">
            {packageName}
          </Badge>
        ))}
      </span>
      <CommandLine command={command} />
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" />
        {elevationNotice(option.elevation)}
      </span>
    </label>
  )
}

function InstallRunner({
  controller,
  manual,
  onOpenChange,
  progress,
}: {
  controller: LatexInstallController
  manual: ManualInstruction | null
  onOpenChange: (open: boolean) => void
  progress: InstallProgress
}) {
  const running = progress.status === "running"
  const elapsed = useElapsedSeconds(running, progress.startedAt)
  const completed = completedStepCount(progress)
  const total = progress.steps.length

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <InstallStatusIcon status={progress.status} />
          <span className="font-medium">
            {installStatusLabel(progress.status)}
          </span>
          <span className="truncate text-muted-foreground">
            {running
              ? `${installStepSummary(progress)} · ${formatDuration(elapsed)} elapsed`
              : `${completed} of ${total} steps completed`}
          </span>
        </p>
        <div
          aria-label="Installation progress"
          aria-valuemax={total}
          aria-valuemin={0}
          aria-valuenow={completed}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
              progress.status === "failed" ? "bg-destructive" : "bg-primary"
            )}
            style={{ width: `${total === 0 ? 0 : (completed / total) * 100}%` }}
          />
        </div>
      </div>

      <ol
        aria-label="Installation steps"
        className="flex flex-col gap-1.5 rounded-lg border p-2"
      >
        {progress.steps.map((step, index) => (
          <InstallStepRow key={step.title} position={index + 1} step={step} />
        ))}
      </ol>

      <InstallLog progress={progress} />

      {progress.message !== null && !running ? (
        <Alert
          variant={
            progress.status === "succeeded"
              ? "default"
              : progress.status === "restartRequired"
                ? "default"
                : "destructive"
          }
        >
          {progress.status === "succeeded" ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <AlertCircle aria-hidden="true" />
          )}
          <AlertTitle>{installStatusLabel(progress.status)}</AlertTitle>
          <AlertDescription>{progress.message}</AlertDescription>
        </Alert>
      ) : null}

      {progress.status === "failed" && manual !== null ? (
        <ManualFallback manual={manual} platform={null} />
      ) : null}

      <p aria-live="polite" className="sr-only">
        {running
          ? `${installStatusLabel(progress.status)}. ${installStepSummary(progress)}.`
          : (progress.message ?? installStatusLabel(progress.status))}
      </p>

      <DialogFooter>
        {running ? (
          <>
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Continue in background
            </Button>
            <Button
              onClick={() => runDetached(controller.stop())}
              variant="destructive"
            >
              Stop installation
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => {
                controller.dismiss()
                onOpenChange(false)
              }}
              variant={progress.status === "succeeded" ? "default" : "outline"}
            >
              Close
            </Button>
            {progress.status === "succeeded" ? null : (
              <Button onClick={controller.dismiss} variant="default">
                <RotateCcw aria-hidden="true" data-icon="inline-start" />
                Choose another method
              </Button>
            )}
          </>
        )}
      </DialogFooter>
    </>
  )
}

function InstallStepRow({
  position,
  step,
}: {
  position: number
  step: InstallStepState
}) {
  return (
    <li className="flex min-w-0 items-start gap-2 rounded-md px-1.5 py-1">
      <StepIcon status={step.status} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "text-sm",
              step.status === "pending"
                ? "text-muted-foreground"
                : "font-medium"
            )}
          >
            {position}. {step.title}
          </span>
          {step.optional ? <Badge variant="outline">Optional</Badge> : null}
          <span className="sr-only">{stepStatusLabel(step.status)}</span>
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {step.detail ?? step.command}
        </span>
      </span>
    </li>
  )
}

function StepIcon({ status }: { status: InstallStepState["status"] }) {
  switch (status) {
    case "running":
      return (
        <Loader2
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
        />
      )
    case "succeeded":
      return (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )
    case "failed":
      return (
        <AlertCircle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-destructive"
        />
      )
    case "skipped":
      return (
        <CircleSlash
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
      )
    case "pending":
      return (
        <Circle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
        />
      )
  }
}

function InstallStatusIcon({ status }: { status: InstallProgress["status"] }) {
  if (status === "running")
    return (
      <Loader2
        aria-hidden="true"
        className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
      />
    )
  if (status === "succeeded")
    return <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
  if (status === "cancelled")
    return (
      <CircleSlash
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    )
  return (
    <AlertCircle
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0",
        status === "failed" ? "text-destructive" : "text-muted-foreground"
      )}
    />
  )
}

function InstallLog({ progress }: { progress: InstallProgress }) {
  const [expanded, setExpanded] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const entryCount = progress.log.length

  useEffect(() => {
    if (!expanded) return
    const element = viewport.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    )
    if (element !== undefined && element !== null)
      element.scrollTop = element.scrollHeight
  }, [entryCount, expanded])

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        aria-expanded={expanded}
        className="w-fit"
        onClick={() => setExpanded((current) => !current)}
        size="sm"
        variant="ghost"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "transition-transform motion-reduce:transition-none",
            expanded ? "rotate-90" : ""
          )}
          data-icon="inline-start"
        />
        {expanded
          ? "Hide package manager output"
          : "Show package manager output"}
        {entryCount === 0 ? null : (
          <Badge variant="secondary">{entryCount}</Badge>
        )}
      </Button>
      {expanded ? (
        <ScrollArea className="h-48 rounded-md border bg-source" ref={viewport}>
          <ol
            aria-label="Package manager output"
            className="p-2 font-mono text-xs leading-5"
          >
            {entryCount === 0 ? (
              <li className="text-muted-foreground">
                Waiting for the package manager…
              </li>
            ) : null}
            {progress.log.map((entry) => (
              <li
                className="break-words whitespace-pre-wrap text-source-foreground"
                key={entry.sequence}
              >
                {entry.text || " "}
              </li>
            ))}
          </ol>
        </ScrollArea>
      ) : null}
    </div>
  )
}

function ManualFallback({
  manual,
  platform,
}: {
  manual: ManualInstruction
  platform: string | null
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Terminal aria-hidden="true" className="size-4 shrink-0" />
        Install it yourself instead
        {platform === null ? null : <Badge variant="outline">{platform}</Badge>}
      </p>
      <p className="text-sm text-muted-foreground">{manual.summary}</p>
      {manual.command === null ? null : (
        <CommandLine command={manual.command} />
      )}
      <p className="text-xs break-all text-muted-foreground">
        Documentation: {manual.documentation}
      </p>
    </div>
  )
}

/** Shows the exact command and lets the user take it to their own terminal. */
function CommandLine({ command }: { command: string }) {
  const clipboard = useClipboard()
  return (
    <span className="flex min-w-0 items-center gap-1 rounded-md bg-source px-2 py-1">
      <span className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre text-source-foreground">
        {command}
      </span>
      <Button
        aria-label="Copy command"
        onClick={(event) => {
          event.preventDefault()
          runDetached(clipboard.copyText(command))
        }}
        size="icon-sm"
        title="Copy command"
        type="button"
        variant="ghost"
      >
        <Copy aria-hidden="true" />
      </Button>
      <span aria-live="polite" className="sr-only">
        {clipboard.status === "copied" ? "Command copied" : ""}
      </span>
    </span>
  )
}

/** Ticks only while an installation is running so an idle dialog never rerenders. */
function useElapsedSeconds(active: boolean, startedAt: number): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000))
  useEffect(() => {
    if (!active) return
    setNow(Math.floor(Date.now() / 1_000))
    const interval = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1_000)),
      1_000
    )
    return () => window.clearInterval(interval)
  }, [active])
  return Math.max(0, now - startedAt)
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

function stepStatusLabel(status: InstallStepState["status"]): string {
  switch (status) {
    case "pending":
      return "Not started"
    case "running":
      return "In progress"
    case "succeeded":
      return "Completed"
    case "failed":
      return "Failed"
    case "skipped":
      return "Skipped"
  }
}
